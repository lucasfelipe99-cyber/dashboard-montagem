# Dashboard de Montagem Industrial

Dashboard web profissional e responsivo para acompanhamento da produção e montagem de fábrica. O projeto usa Vite, HTML, CSS, JavaScript, PapaParse, ApexCharts, vis-timeline, Tabulator e Lucide Icons.

## Recursos implementados

- Leitura direta do Google Sheets publicado como CSV.
- Configuração centralizada em `src/config.js`.
- Atualização automática sem recarregar a página.
- Botão de atualização manual, estado de carregamento e mensagem de erro quando a planilha não puder ser acessada.
- Filtros globais por período, turno, funcionário, produto, status, andamento, concluídas e texto livre.
- Seis páginas: Visão Geral, Linha do Tempo, Funcionários, Produtos, Análise de Tempos e Base de Dados.
- Linha do tempo tipo Gantt agrupada por funcionário.
- Ociosidade automática entre atividades.
- Detecção de duplicidade, sobreposição, duração inválida e registros em andamento.
- Tratamento de turnos que atravessam meia-noite.
- Cards, gráficos interativos, tabelas com paginação, filtros e ordenação.
- Modo apresentação para TV com menu oculto, fonte ampliada e rotação automática.
- Aba de Configurações para cadastrar horários por funcionário e tempo teórico unitário por montagem.

## Instalação

```bash
npm install
npm run dev
```

Abra a URL local exibida pelo Vite.

## Rodar build de produção

```bash
npm run build
npm run preview
```

## Conectar Google Sheets real

Pelo dashboard, acesse `Configurações > Conexão da base`, cole o ID ou URL da planilha, confirme o nome da aba e clique em `Salvar configurações`.

Também é possível configurar por `.env`. Use:

```env
VITE_SPREADSHEET_ID=1UdR9VGisFlLRkBDZdVGzHqoo3LLEFvegR9ZI6Om6tSE
VITE_SHEET_NAME=DB
VITE_SHEET_GID=1017368919
VITE_REFRESH_INTERVAL=60000
```

Também é possível alterar diretamente `CONFIG` em `src/config.js`.

## Publicar a planilha como CSV

1. Abra a planilha no Google Sheets.
2. Acesse `Arquivo > Compartilhar > Publicar na Web`.
3. Selecione a aba `DB`.
4. Publique como CSV.
5. Informe o ID da planilha em `VITE_SPREADSHEET_ID`.

A URL usada pelo app segue este padrão:

```text
https://docs.google.com/spreadsheets/d/ID_DA_PLANILHA/gviz/tq?tqx=out:csv&sheet=DB
```

## Configurar colunas

Altere somente `COLUMN_MAP` em `src/config.js`. Para colunas repetidas, como duas colunas chamadas `MONTAGEM`, o parser preserva a primeira como `MONTAGEM` e a segunda como `MONTAGEM__2`.

```js
export const COLUMN_MAP = {
  employee: "MONTADORES",
  product: "MONTAGEM",
  productColumnIndex: 3,
  secondaryAssemblyColumnIndex: 7
};
```

## Configurar turnos e pausas

Os turnos ficam em `WORK_SCHEDULE`, no arquivo `src/config.js`.

```js
export const WORK_SCHEDULE = {
  turno1: { label: "1º Turno", start: "05:00", end: "14:00", breaks: [] },
  turno2: { label: "2º Turno", start: "14:00", end: "23:30", breaks: [] },
  turno3: { label: "3º Turno", start: "21:00", end: "05:20", breaks: [] }
};
```

Para pausas programadas futuras:

```js
breaks: [{ label: "Almoço", start: "11:00", end: "12:00" }]
```

## Configurar horários por funcionário

Acesse a aba `Configurações` no menu lateral. Em `Horários por funcionário`, informe funcionário, turno, entrada, saída e pausas. Essas configurações ficam salvas no `localStorage` do navegador e têm prioridade sobre o horário padrão do turno nos cálculos de ocupação e disponibilidade.

## Configurar tempo teórico por montagem

Na aba `Configurações`, use `Tempo teórico por montagem` para cadastrar o tempo teórico unitário de cada montagem/produto no formato `HH:mm:ss`, por exemplo `00:08:30`.

O valor cadastrado tem prioridade sobre o tempo teórico vindo da planilha. O tempo teórico total será recalculado como `Quantidade × tempo teórico unitário cadastrado`.

## Cálculos

- Duração real: horário final menos horário inicial.
- Atividade em andamento: horário atual menos horário inicial.
- Tempo teórico total: valor da base ou quantidade vezes tempo teórico unitário.
- Eficiência: tempo teórico total dividido pelo tempo real total.
- Produtividade por hora: quantidade produzida dividida pelas horas reais.
- Variação: tempo real menos tempo teórico.
- Ocupação: tempo trabalhado dividido pelo tempo disponível da jornada.
- Ociosidade: espaços entre atividades do mesmo funcionário, sem considerar antes da primeira ou depois da última atividade.

As durações são exibidas em `HH:mm:ss` e podem ultrapassar 24 horas.

## Google Sheets API futura

O app está preparado para trocar o método de leitura em `src/services/sheetsService.js`. Para usar a API oficial no futuro:

1. Criar um projeto no Google Cloud.
2. Ativar Google Sheets API.
3. Criar credenciais adequadas.
4. Substituir `fetchGoogleSheetRows()` por uma chamada autenticada à API.
5. Manter `normalizeRecords()` sem alterações, pois o restante do sistema depende apenas dos dados normalizados.

## Resolver erro de CORS

Se a planilha publicada como CSV retornar erro de CORS:

- confirme se a planilha está publicada na Web;
- confirme se o ID e o nome da aba estão corretos;
- teste a URL CSV no navegador;
- use um proxy próprio ou a Google Sheets API quando a planilha não puder ser pública.

## Publicação

### Vercel

1. Faça upload do repositório.
2. Framework: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Configure as variáveis `VITE_SPREADSHEET_ID`, `VITE_SHEET_NAME` e `VITE_REFRESH_INTERVAL`.

### Netlify

1. Build command: `npm run build`.
2. Publish directory: `dist`.
3. Configure as mesmas variáveis de ambiente.

### GitHub Pages

1. Rode `npm run build`.
2. Publique a pasta `dist`.
3. Se o projeto ficar em subpasta, configure `base` no Vite.

## Estrutura

```text
dashboard-montagem/
├── index.html
├── package.json
├── README.md
├── .env.example
├── src/
│   ├── main.js
│   ├── config.js
│   ├── styles.css
│   ├── services/
│   ├── components/
│   ├── pages/
│   └── utils/
└── public/
    └── assets/
```

## Observações

O dashboard não possui fallback para dados fictícios. Se a planilha real não estiver publicada corretamente, o app mostrará a mensagem de erro para ajuste da conexão.
