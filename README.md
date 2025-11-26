## Contego NOC Dashboard

Dashboard que replica os indicadores do mock enviado e se conecta ao Zabbix para consolidar métricas mensais por cliente (host group). Construído em Next.js 16 (App Router) + Tailwind v4, com componentes client-side leves para filtros e visualização.

### Principais recursos
- Visão global (`/`): cards de KPIs consolidados e tabela com todos os host groups, incluindo alertas, tempos médios e disponibilidade geral/comercial.
- KPIs de detecção, resposta, resolução e disponibilidade geral com metas configuradas no front-end.
- Tabela de hosts por categoria (Servidores, Endpoints, Dispositivos de Rede, IoT/Outros) com cobertura e SLA calculados via downtime.
- Disponibilidade segmentada por horário comercial (7h–23:59) e fora do expediente, com barras coloridas.
- Cartão de falsos positivos/negativos baseado em tags/comentários dos incidentes.
- Filtros para mês (últimos 12 meses) e cliente (host group do Zabbix).
- API internas (`/api/metrics`, `/api/group-metrics`, `/api/host-groups`) que comunicam com o JSON-RPC do Zabbix usando token.
- Cartões de resumo para qualquer nível (global ou por cliente) exibindo alertas totais/em aberto, tempos médios e disponibilidade geral/comercial.
- Card adicional mostra o total de hosts monitorados (global ou filtrado) e outro card destaca quantos estão inativos (status desabilitado no Zabbix).
- Tabela auxiliar apresenta a distribuição dos alertas por criticidade (severidade Zabbix) para o escopo filtrado.

### Pré-requisitos
1. **Token do Zabbix** com permissão para `hostgroup.get`, `host.get`, `problem.get` e `event.get`.
2. Node.js 18.18+ (Next 16 exige runtimes modernos).
3. Instalar dependências:
   ```bash
   npm install
   ```

### Configuração de ambiente
Crie `.env.local` na raiz do projeto (`noc-dashboard/.env.local`) e defina:
```bash
ZABBIX_API_URL=https://noc.contego.com.br/api_jsonrpc.php
ZABBIX_API_TOKEN=39bcee2a16c99311e09df3a5b33e0f60d1a56e009d1f006c14489ccf477401ef
# Opcional – ajuste se o horário comercial for diferente
DASHBOARD_TIMEZONE=America/Sao_Paulo
DASHBOARD_BUSINESS_START_HOUR=9
DASHBOARD_BUSINESS_END_HOUR=18
```

> **Segurança:** nunca exponha o token em variáveis `NEXT_PUBLIC_`. Todas as chamadas acontecem no servidor (API Routes), então o token permanece privado.

### Desenvolvimento
```bash
npm run dev
# abre http://localhost:3000
```

### Build/produção
```bash
npm run build
npm start
```

### Estrutura
```
src/
 ├─ app/
 │   ├─ api/
 │   │   ├─ host-groups/route.ts  # lista host groups do Zabbix
 │   │   └─ metrics/route.ts      # agrega métricas mensais
 │   ├─ layout.tsx / page.tsx     # layout + dashboard shell
 │   └─ globals.css               # tema base
 ├─ components/dashboard/         # cards, filtros, etc.
 ├─ lib/
 │   ├─ zabbix.ts                 # client JSON-RPC
 │   └─ metrics.ts                # cálculo de KPIs/SLA
 └─ types/dashboard.ts            # contratos usados no front
```

### Como as métricas são calculadas
- **Tempo médio de detecção/resposta:** diferença entre `problem.clock` e os dois primeiros `acknowledges`. Se não houver acknowledgment, o dado é ignorado.
- **Tempo médio de resolução:** duração entre o evento `problem` e seu `r_eventid` (ou final do período se ainda aberto).
- **Disponibilidade geral/SLA:** `1 - (downtime acumulado / (hosts monitorados × segundos do período))`.
- **Disponibilidade por horário:** o downtime é fatiado a cada 5 minutos e separado entre janela comercial e fora dela (timezone configurável).
- **Categorias de host:** classificação heurística por nome/tag/inventory para os quatro grupos apresentados no mock.
- **Falsos positivos/negativos:** busca por palavras-chave (`"falso positivo"`, `"false positive"`, `[FP]`, `[FN]` etc.) nas tags/comentários de cada problema.

### Próximos passos sugeridos
1. Ligar os filtros às metas reais (guardar metas no backend ou CMS).
2. Ajustar heurísticas de classificação de host conforme o padrão Contego (tags específicas, inventário, etc.).
3. Adicionar testes automatizados para `lib/metrics.ts` validando os cálculos de disponibilidade/downtime.
4. Implementar caching com revalidação (ex.: route handlers usando `cache: "no-store"` já evitam stale data, mas dá para colocar Redis se necessário).

Qualquer dúvida sobre integração com o Zabbix ou expansão do layout é só avisar!
