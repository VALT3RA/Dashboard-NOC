## Metodologia de Calculo das Metricas

Este documento descreve como cada metrica exibida no dashboard do host group **CAP-switches** e produzida a partir dos dados do Zabbix. Todo o processamento acontece no servidor (`src/lib/metrics.ts`) a partir das respostas das APIs `event.get`, `host.get`, `hostgroup.get` e `event.get` (para eventos de recuperacao).

### 1. Definicoes Gerais
- **Periodo analisado**: mes completo selecionado na interface (intervalo [AAAAMM-01 00:00:00, mes seguinte)). Todas as datas sao convertidas para epoch seconds.
- **Hosts considerados**: resultado de `host.get` com `groupids=<CAP-switches>`; mesmo os hosts sem problema no mes aparecem com 0 alertas.
- **Eventos (alertas)**: `event.get` com `source=0`, `object=0`, `value=1` (apenas problemas) filtrado pelo grupo e intervalo do mes. Trouxemos `selectHosts`, `select_tags` e `select_acknowledges` para enriquecer os dados.
- **Eventos de recuperacao**: `event.get` adicional com os `r_eventid` retornados anteriormente. Sem `r_eventid`, o problema e tratado como ainda em aberto.
- **Janela comercial**: 07h as 23:59 no fuso `America/Sao_Paulo` (configuravel via `.env.local`).
- **Passo de integracao para disponibilidade**: 5 minutos (tambem configuravel).

### 2. KPIs de Tempo (Deteccao, Resposta, Resolucao)
Para cada evento:
1. **Inicio do problema (`problemStart`)**: `max(clock, inicio do mes)`.
2. **Termino (`problemEnd`)**:
   - Se ha `r_eventid`, usamos o `clock` do evento de recuperacao.
   - Caso contrario, `problemEnd = fim do mes` (o problema continua aberto).
3. **Acknowledges**:
   - Ordenamos os ACKs por `clock`.
   - `firstAck` e o primeiro registro: `detectionDelta = firstAck.clock - problemStart`.
   - `secondAck` (quando existe) e `responseDelta = secondAck.clock - problemStart`.
   - Ausencia de ACK mantem a metrica vazia porque o Zabbix nao registrou confirmacao manual.
4. **Resolucao**: `resolutionDelta = problemEnd - problemStart`.
5. **Valores medios**: guardamos os deltas por host e tambem numa colecao global; ao final convertemos de segundos para minutos e calculamos a media simples.

### 3. Disponibilidade
1. **Downtime por host**: para cada evento e cada host envolvido, adicionamos `problemEnd - problemStart` aos acumuladores `total`, `business` (janela comercial) e `off` (fora do expediente). A divisao por horario usa uma integracao em passos de 5 minutos para considerar o fuso horario corretamente.
2. **Disponibilidade geral**:  
   Availability = 100 * ((N_hosts * segundos do periodo) - downtime total) / (N_hosts * segundos do periodo)
3. **Disponibilidade por horario**: aplicamos a mesma formula usando apenas as fatias de tempo comercial (7h–23:59) e fora do expediente. A soma das fatias e calculada pela funcao `splitSecondsByShift`.
4. **Disponibilidade por host**: pegamos o downtime individual (`hostDowntime[hostid]`) e aplicamos as duas equacoes: uma para o periodo completo (campos `availabilityPct`), outra so para o horario comercial (`businessAvailabilityPct`).

### 4. Contagem de Alertas
- **Alertas (periodo)**: quantidade total de eventos retornados para o mes/host group.
- **Alertas em aberto**: eventos sem `r_eventid` (ainda nao existe evento de recuperacao). O valor aparece tanto nos cartoes do grupo quanto em cada linha da tabela.
- **Hosts ativos x inativos**: alem do total de hosts carregados pelo `host.get`, contamos quantos estao com `status !== 0` (desabilitados) para exibir no card de hosts inativos.
- **Alertas por criticidade**: somamos o numero de incidentes por nivel de severidade (0 a 5) usando `problem.severity`, e exibimos essa distribuicao numa tabela auxiliar entre os cartoes e a lista de host groups.

### 5. Metricas por Host
Para cada host listado:
- `eventCount`: numero de eventos que mencionam o host no mes.
- `openEventCount`: subset desses eventos sem `r_eventid`.
- `detectionMinutes`, `responseMinutes`, `resolutionMinutes`: medias dos deltas calculados apenas com ACKs existentes para aquele host.
- `availabilityPct` e `businessAvailabilityPct`: formulas descritas na secao 3 aplicadas ao downtime do host (total e janela comercial).

### 6. Regras de Fallback
- **Sem ACK**: metricas de deteccao e resposta ficam vazias porque nao ha dado confiavel; ainda assim, o evento conta para os totais de alertas e para a disponibilidade.
- **Problema sem recuperacao**: e considerado em aberto e o tempo de resolucao cresce ate o fim do mes selecionado.
- **Host sem eventos**: aparece com 0 alertas, 100% de disponibilidade e campos vazios para tempos (pois nao houve incidentes).

### 7. Variaveis de Ambiente relevantes
- `ZABBIX_API_URL` / `ZABBIX_API_TOKEN`: conexao com o Zabbix.
- `DASHBOARD_TIMEZONE`, `DASHBOARD_BUSINESS_START_HOUR`, `DASHBOARD_BUSINESS_END_HOUR`, `DASHBOARD_SHIFT_STEP_MINUTES`: impactam o fatiamento de disponibilidade.
- `ZABBIX_PROBLEM_LIMIT`: limite maximo de eventos buscados (padrao 5000). Ajuste se o grupo gerar mais eventos mensais.

### 8. Referencias de Codigo
- `src/lib/zabbix.ts`: clientes para o JSON-RPC do Zabbix.
- `src/lib/metrics.ts`: agregacao de tempos, disponibilidade, contagens e categorizacao.
- `src/components/global-overview.tsx`: consumo das metricas e apresentacao do dashboard atual (cards, tabela e filtros).

Com esse pipeline, o dashboard reflete os dados brutos do Zabbix, permitindo validar cada numero cruzando com o historico (`Problemas > History`) para o host group CAP-switches.
