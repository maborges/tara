---
name: Backoffice SaaS
description: Central de controle administrativa para assinantes e configurações da plataforma.
colors:
  background: "hsl(0 0% 97%)"
  foreground: "hsl(15 10% 5%)"
  surface: "#fafafa"
  card: "hsl(0 0% 100%)"
  primary: "hsl(208 100% 32%)"
  secondary: "hsl(134 61% 41%)"
  muted: "hsl(208 20% 96%)"
  muted-foreground: "hsl(208 20% 40%)"
  border: "hsl(208 30% 88%)"
  accent: "hsl(208 80% 92%)"
  destructive: "hsl(0 84.2% 60.2%)"
  module-agro: "#2e7d32"
  module-pecuaria: "#ef6c00"
  module-financeiro: "#1565c0"
  module-operacional: "#0284c7"
  module-backoffice: "#7c3aed"
typography:
  body:
    fontFamily: "Inter, Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  label:
    fontFamily: "Inter, Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
rounded:
  sm: "calc(0.5rem * 0.6)"
  md: "calc(0.5rem * 0.8)"
  lg: "0.5rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "hsl(0 0% 98%)"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.625rem"
    height: "2rem"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.75rem"
    height: "2rem"
---

# Design System: Backoffice SaaS

## Overview

**Creative North Star: “Central de Controle”**

O backoffice é uma interface administrativa compacta, técnica e orientada à operação. A organização visual deve ajudar o administrador do SaaS a localizar assinantes, compreender estados e ajustar configurações com pouco atrito.

A identidade atual combina uma base neutra quase branca com azul como cor de ação e navegação, verde como apoio semântico e cores específicas para módulos. A interface deve manter sua densidade e previsibilidade; profundidade vem de camadas tonais, bordas sutis e sombras leves, não de ornamentação.

**Key Characteristics:**

- Operacional e direto
- Densidade compacta
- Azul primário com semântica por módulo
- Cantos pequenos e bordas discretas
- Sem efeitos degradê

## Colors

A paleta é funcional: neutros sustentam leitura e agrupamento; azul sinaliza ação e foco; verde e as cores de módulo comunicam contexto.

### Primary

- **Azul de Controle** (`hsl(208 100% 32%)`): ações primárias, foco, navegação ativa e elementos de controle.
- **Verde de Confirmação** (`hsl(134 61% 41%)`): ações secundárias e estados positivos.

### Neutral

- **Fundo Neutro** (`hsl(0 0% 97%)`): superfície geral da aplicação.
- **Superfície** (`#fafafa`): áreas de conteúdo e fundos auxiliares.
- **Cartão** (`hsl(0 0% 100%)`): containers e superfícies elevadas.
- **Texto Principal** (`hsl(15 10% 5%)`): títulos e conteúdo prioritário.
- **Texto Muted** (`hsl(208 20% 40%)`): descrições e metadados.
- **Borda** (`hsl(208 30% 88%)`): separadores, campos e contornos.

### Module Colors

- **Agro** (`#2e7d32`)
- **Pecuária** (`#ef6c00`)
- **Financeiro** (`#1565c0`)
- **Operacional** (`#0284c7`)
- **Backoffice** (`#7c3aed`)

### Named Rules

**The No-Gradient Rule.** Não usar degradês como tratamento visual de fundo, texto ou ação. Priorizar cores sólidas e contraste funcional.

## Typography

**Body Font:** Inter, com Geist e fontes de sistema como fallback.

**Character:** Tipografia sem serifa, compacta e legível em fluxos administrativos. Pesos médios e semibold criam hierarquia sem aumentar a área ocupada.

### Hierarchy

- **Headings** (semibold, escala definida pelo componente): títulos de páginas e seções.
- **Body** (medium, `0.875rem`, line-height `1.5`): conteúdo operacional e descrições.
- **Label** (normal, aproximadamente `0.8rem`): campos, controles e metadados.

### Named Rules

**The Compact Type Rule.** Manter a hierarquia clara dentro de uma escala compacta; não aumentar títulos ou espaçamentos apenas para criar impacto decorativo.

## Layout

O layout favorece uma estrutura de aplicação com navegação lateral e área principal de trabalho. Conteúdo administrativo deve permanecer escaneável, com agrupamento por cards, tabelas, formulários e cabeçalhos de página. Usar espaçamento curto entre controles e `1rem` como unidade confortável entre grupos.

A interface é responsiva e deve preservar a densidade sem comprimir texto ou controles abaixo de tamanhos utilizáveis. A navegação lateral pode colapsar em telas menores, mantendo acesso às mesmas áreas e estados.

## Elevation & Depth

O sistema usa um híbrido discreto: camadas tonais claras, anéis/bordas sutis e sombras pequenas. A profundidade deve comunicar agrupamento e estado, não decoração.

### Shadow Vocabulary

- **Low ambient:** `shadow-sm`, para cards e controles que precisam se separar levemente do fundo.
- **Premium subtle:** `0 10px 15px -3px rgba(217, 119, 87, 0.05), 0 4px 6px -2px rgba(217, 119, 87, 0.03)`, quando a implementação existente já o utilizar.

## Shapes

As formas são compactas e discretas. O raio-base é `0.5rem`, com o uso mais comum de `rounded-sm` (`0.3rem`) em botões, inputs, cards e elementos de navegação. Bordas são preferíveis a contornos pesados; evitar grandes pílulas e silhuetas excessivamente arredondadas.

## Components

### Buttons

- **Shape:** raio pequeno, normalmente `rounded-sm` (`0.3rem`).
- **Primary:** azul de controle, texto claro, altura padrão de `2rem`, padding compacto.
- **Secondary:** verde para ações secundárias quando houver semântica positiva.
- **Outline / Ghost:** fundo neutro ou transparente com azul no hover e foco.
- **Hover / Focus:** mudança de cor sutil, anel de foco visível e transição curta; feedback ativo pode usar redução discreta de escala.

### Cards / Containers

- **Corner Style:** raio pequeno.
- **Background:** branco ou superfície neutra.
- **Shadow Strategy:** sombra baixa e/ou anel de borda sutil.
- **Border:** `border` ou `ring` em tom azul-neutro claro.
- **Internal Padding:** normalmente `1rem`, reduzido em variantes compactas.

### Inputs / Fields

- **Style:** altura `2rem`, fundo neutro, borda sutil e raio pequeno.
- **Focus:** borda azul e anel azul muito suave.
- **Error / Disabled:** vermelho destrutivo para erro; muted, menor opacidade e bloqueio de interação para desabilitado.

### Navigation

- **Style:** navegação lateral clara, com foreground azul-neutro e estado ativo em azul primário.
- **Active:** fundo de acento azul claro ou azul primário conforme o nível de navegação.
- **Mobile:** colapsável, sem remover áreas administrativas.

### Module Indicators

Usar as cores de módulo apenas para comunicar contexto, categoria ou estado relacionado ao módulo. Não transformar cada tela em uma composição multicolorida.

## Do's and Don'ts

### Do:

- **Do** manter a interface compacta e orientada à operação.
- **Do** usar azul para ações, foco e navegação ativa.
- **Do** usar cores de módulo com função semântica clara.
- **Do** preservar estados de foco, erro, desabilitado e seleção.
- **Do** preferir bordas sutis, camadas tonais e sombras leves.

### Don't:

- **Don't** usar degradês.
- **Don't** introduzir componentes grandes e excessivamente espaçados sem necessidade operacional.
- **Don't** usar cores de módulo como decoração sem significado.
- **Don't** substituir a lógica, as permissões ou o comportamento funcional ao fazer melhorias de IU/UX.
- **Don't** usar sombras pesadas, efeitos chamativos ou cantos exageradamente arredondados.
