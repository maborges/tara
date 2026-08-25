"use client"

/**
 * EXEMPLO DE USO DO COMPONENTE DataTable
 *
 * Este arquivo demonstra como usar o DataTable com todas as suas funcionalidades:
 * - Filtros por coluna
 * - Ordenação
 * - Busca global
 * - Exportação para Excel e PDF
 * - Personalização de células
 */

import { DataTable, ColumnDef } from "./data-table"
import { Badge } from "./badge"
import { format } from "date-fns"
import { StatusBadge } from "@/components/ui/status-badge";

// Tipo de dados de exemplo
type Usuario = {
  id: string
  nome: string
  email: string
  perfil: string
  status: "ativo" | "inativo"
  dataCriacao: Date
  fazendas: number
}

// Dados de exemplo
const dadosExemplo: Usuario[] = [
  {
    id: "1",
    nome: "João Silva",
    email: "joao@exemplo.com",
    perfil: "admin",
    status: "ativo",
    dataCriacao: new Date("2024-01-15"),
    fazendas: 3,
  },
  {
    id: "2",
    nome: "Maria Santos",
    email: "maria@exemplo.com",
    perfil: "gerente",
    status: "ativo",
    dataCriacao: new Date("2024-02-20"),
    fazendas: 2,
  },
  {
    id: "3",
    nome: "Pedro Oliveira",
    email: "pedro@exemplo.com",
    perfil: "operador",
    status: "inativo",
    dataCriacao: new Date("2024-03-10"),
    fazendas: 1,
  },
]

// Definição das colunas
const colunas: ColumnDef<Usuario>[] = [
  {
    id: "nome",
    header: "Nome",
    accessorKey: "nome",
    sortable: true,
    filterable: true,
    filterPlaceholder: "Buscar por nome...",
  },
  {
    id: "email",
    header: "E-mail",
    accessorKey: "email",
    sortable: true,
    filterable: true,
    filterPlaceholder: "Buscar por e-mail...",
  },
  {
    id: "perfil",
    header: "Perfil",
    accessorKey: "perfil",
    sortable: true,
    filterable: true,
    cell: (value) => (
      <Badge variant="outline" className="capitalize">
        {value}
      </Badge>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    sortable: true,
    filterable: true,
    cell: (value) => (
      <StatusBadge status={value === "ativo" ? "ativo" : "inativo"} />
    ),
  },
  {
    id: "dataCriacao",
    header: "Data de Criação",
    accessorKey: "dataCriacao",
    sortable: true,
    filterable: false,
    cell: (value) => format(value, "dd/MM/yyyy"),
    exportFormat: (value) => format(value, "dd/MM/yyyy"),
  },
  {
    id: "fazendas",
    header: "Fazendas",
    accessorKey: "fazendas",
    sortable: true,
    filterable: false,
    cell: (value) => (
      <span className="font-mono">{value}</span>
    ),
  },
]

// Componente de exemplo
export function DataTableExample() {
  const handleRowClick = (row: Usuario) => {
    console.log("Linha clicada:", row)
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Exemplo de DataTable</h1>

      <DataTable
        data={dadosExemplo}
        columns={colunas}
        searchable={true}
        searchPlaceholder="Buscar em todas as colunas..."
        exportable={true}
        exportFileName="usuarios"
        onRowClick={handleRowClick}
        rowClassName={(row) =>
          row.status === "inativo" ? "opacity-50" : ""
        }
        emptyMessage="Nenhum usuário encontrado."
      />
    </div>
  )
}

/**
 * EXEMPLOS DE USO AVANÇADO
 */

// 1. Com accessor function customizada
const colunaComAcessor: ColumnDef<Usuario> = {
  id: "nomeCompleto",
  header: "Nome Completo",
  accessorFn: (row) => `${row.nome} (${row.email})`,
  sortable: true,
}

// 2. Coluna não exportável (útil para ações)
const colunaAcoes: ColumnDef<Usuario> = {
  id: "acoes",
  header: "Ações",
  exportable: false,
  filterable: false,
  sortable: false,
  cell: (_, row) => (
    <button onClick={() => console.log("Editar", row)}>
      Editar
    </button>
  ),
}

// 3. Com formatação customizada para exportação
const colunaComExportCustomizado: ColumnDef<Usuario> = {
  id: "status",
  header: "Status",
  accessorKey: "status",
  cell: (value) => (
    <StatusBadge status={value === "ativo" ? "ativo" : "inativo"} />
  ),
  exportFormat: (value) => value === "ativo" ? "ATIVO" : "INATIVO",
}

/**
 * DICAS DE USO:
 *
 * 1. Todas as colunas são ordenáveis, filtráveis e exportáveis por padrão
 * 2. Use sortable={false} para desabilitar ordenação em colunas específicas
 * 3. Use filterable={false} para desabilitar filtro em colunas específicas
 * 4. Use exportable={false} para excluir colunas da exportação (ex: ações)
 * 5. Use accessorFn quando precisar de lógica complexa para obter o valor
 * 6. Use cell para customizar a renderização na tabela
 * 7. Use exportFormat para customizar o valor na exportação
 * 8. O componente mantém os dados filtrados/ordenados no estado interno
 * 9. Use onRowClick para tornar as linhas clicáveis
 * 10. Use rowClassName para aplicar estilos condicionais nas linhas
 */
