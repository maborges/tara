# DataTable Component

Componente de tabela avançado com filtros, ordenação e exportação para Excel/PDF.

## Funcionalidades

- ✅ **Filtros por coluna** - Cada coluna pode ter seu próprio filtro
- ✅ **Busca global** - Busca em todas as colunas simultaneamente
- ✅ **Ordenação** - Clique nos cabeçalhos para ordenar (asc/desc/none)
- ✅ **Exportação Excel** - Exporta dados filtrados para .xlsx
- ✅ **Exportação PDF** - Exporta dados filtrados para .pdf
- ✅ **Células customizáveis** - Renderize badges, botões, etc.
- ✅ **TypeScript** - Totalmente tipado
- ✅ **Responsivo** - Funciona em todos os tamanhos de tela

## Instalação

As dependências já foram instaladas:
- `xlsx` - Exportação para Excel
- `jspdf` - Exportação para PDF
- `jspdf-autotable` - Tabelas em PDF

## Uso Básico

```tsx
import { DataTable, ColumnDef } from "@/components/ui/data-table"

// Defina o tipo dos seus dados
type Pessoa = {
  id: string
  nome: string
  email: string
  idade: number
}

// Dados
const pessoas: Pessoa[] = [
  { id: "1", nome: "João", email: "joao@exemplo.com", idade: 30 },
  { id: "2", nome: "Maria", email: "maria@exemplo.com", idade: 25 },
]

// Defina as colunas
const colunas: ColumnDef<Pessoa>[] = [
  {
    id: "nome",
    header: "Nome",
    accessorKey: "nome",
  },
  {
    id: "email",
    header: "E-mail",
    accessorKey: "email",
  },
  {
    id: "idade",
    header: "Idade",
    accessorKey: "idade",
  },
]

// Use o componente
export function MinhaTabela() {
  return (
    <DataTable
      data={pessoas}
      columns={colunas}
      exportFileName="pessoas"
    />
  )
}
```

## API do Componente

### Props do DataTable

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `data` | `T[]` | **required** | Array de dados a exibir |
| `columns` | `ColumnDef<T>[]` | **required** | Definição das colunas |
| `searchable` | `boolean` | `true` | Habilita busca global |
| `searchPlaceholder` | `string` | `"Buscar..."` | Placeholder da busca |
| `exportable` | `boolean` | `true` | Habilita botões de exportação |
| `exportFileName` | `string` | `"export"` | Nome base dos arquivos exportados |
| `onRowClick` | `(row: T) => void` | - | Callback ao clicar na linha |
| `rowClassName` | `(row: T) => string` | - | Classe CSS condicional por linha |
| `emptyMessage` | `string` | `"Nenhum registro encontrado."` | Mensagem quando vazio |
| `className` | `string` | - | Classe CSS adicional |

### Definição de Coluna (ColumnDef)

| Propriedade | Tipo | Padrão | Descrição |
|-------------|------|--------|-----------|
| `id` | `string` | **required** | ID único da coluna |
| `header` | `string` | **required** | Título do cabeçalho |
| `accessorKey` | `keyof T` | - | Chave direta do objeto |
| `accessorFn` | `(row: T) => any` | - | Função para obter valor |
| `cell` | `(value: any, row: T) => ReactNode` | - | Renderização customizada |
| `sortable` | `boolean` | `true` | Habilita ordenação |
| `filterable` | `boolean` | `true` | Habilita filtro |
| `filterPlaceholder` | `string` | `"Filtrar..."` | Placeholder do filtro |
| `exportable` | `boolean` | `true` | Inclui na exportação |
| `exportFormat` | `(value: any) => string` | - | Formata valor na exportação |

## Exemplos Avançados

### 1. Coluna com Badge

```tsx
{
  id: "status",
  header: "Status",
  accessorKey: "status",
  cell: (value) => (
    <Badge variant={value === "ativo" ? "default" : "secondary"}>
      {value}
    </Badge>
  ),
  exportFormat: (value) => value.toUpperCase(),
}
```

### 2. Coluna com Formatação de Data

```tsx
import { format } from "date-fns"

{
  id: "dataCriacao",
  header: "Data de Criação",
  accessorKey: "dataCriacao",
  cell: (value) => format(value, "dd/MM/yyyy"),
  exportFormat: (value) => format(value, "dd/MM/yyyy HH:mm"),
}
```

### 3. Coluna com Accessor Function

```tsx
{
  id: "nomeCompleto",
  header: "Nome Completo",
  accessorFn: (row) => `${row.nome} ${row.sobrenome}`,
  filterPlaceholder: "Buscar nome completo...",
}
```

### 4. Coluna de Ações (Não Exportável)

```tsx
{
  id: "acoes",
  header: "Ações",
  exportable: false,
  filterable: false,
  sortable: false,
  cell: (_, row) => (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => editar(row)}>Editar</Button>
      <Button size="sm" variant="destructive" onClick={() => excluir(row)}>
        Excluir
      </Button>
    </div>
  ),
}
```

### 5. Linha Clicável com Estilo Condicional

```tsx
<DataTable
  data={usuarios}
  columns={colunas}
  onRowClick={(row) => router.push(`/usuarios/${row.id}`)}
  rowClassName={(row) =>
    row.status === "inativo" ? "opacity-50" : ""
  }
/>
```

### 6. Desabilitar Recursos

```tsx
<DataTable
  data={dados}
  columns={colunas}
  searchable={false}      // Sem busca global
  exportable={false}      // Sem exportação
/>
```

## Hook useDataTable

Para casos mais complexos, você pode usar o hook `useDataTable`:

```tsx
import { useDataTable } from "@/hooks/use-data-table"

function MinhaTabela() {
  const {
    data: filteredData,
    sortConfig,
    filters,
    globalFilter,
    handleSort,
    handleFilter,
    clearFilter,
    clearAllFilters,
    setGlobalFilter,
    totalRecords,
    filteredRecords,
  } = useDataTable({
    data: minhasDados,
    initialSort: { key: "nome", direction: "asc" },
  })

  // Use os dados e funções conforme necessário
  return (
    <div>
      <p>{filteredRecords} de {totalRecords} registros</p>
      {/* Sua tabela customizada */}
    </div>
  )
}
```

## Exportação

### Excel (XLSX)
- Exporta apenas colunas com `exportable !== false`
- Usa `exportFormat` se definido, senão usa valor direto
- Nome do arquivo: `{exportFileName}.xlsx`

### PDF
- Exporta apenas colunas com `exportable !== false`
- Usa `exportFormat` se definido, senão usa valor direto
- Formatação automática de tabela
- Nome do arquivo: `{exportFileName}.pdf`

## Performance

O componente usa `React.useMemo` para otimizar:
- Ordenação (recalcula apenas quando dados ou sort mudam)
- Filtragem (recalcula apenas quando filtros mudam)
- Renderização (apenas dados visíveis são renderizados)

Para grandes volumes de dados (>1000 registros), considere:
- Paginação server-side
- Virtualização de linhas
- Debounce nos filtros

## Migração de Tabelas Antigas

Se você tem tabelas usando o componente `Table` antigo:

**Antes:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Nome</TableHead>
      <TableHead>Email</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map(item => (
      <TableRow key={item.id}>
        <TableCell>{item.nome}</TableCell>
        <TableCell>{item.email}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Depois:**
```tsx
const columns: ColumnDef<typeof data[0]>[] = [
  { id: "nome", header: "Nome", accessorKey: "nome" },
  { id: "email", header: "Email", accessorKey: "email" },
]

<DataTable data={data} columns={columns} />
```

## Exemplo Completo

Veja [data-table-example.tsx](./data-table-example.tsx) para um exemplo completo com:
- Todos os tipos de colunas
- Células customizadas
- Formatação de dados
- Exportação personalizada
- Dicas de uso avançado

## Troubleshooting

### Exportação não funciona
- Verifique se `pnpm install` foi executado
- Verifique se as dependências `xlsx`, `jspdf` e `jspdf-autotable` estão instaladas

### Ordenação não funciona
- Certifique-se que `accessorKey` ou `accessorFn` está definido
- Verifique se `sortable !== false`

### Filtro não funciona
- Certifique-se que `accessorKey` ou `accessorFn` está definido
- Verifique se `filterable !== false`

### TypeScript errors
- Certifique-se que o tipo `T` está corretamente definido
- Use `accessorKey: keyof T` para autocomplete

## Suporte

Para issues ou dúvidas, consulte:
- [data-table.tsx](./data-table.tsx) - Código fonte
- [data-table-example.tsx](./data-table-example.tsx) - Exemplos de uso
- [use-data-table.ts](../../hooks/use-data-table.ts) - Hook customizado
