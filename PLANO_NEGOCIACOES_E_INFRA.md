# BR Técnico — Negociações Dinâmicas, Empréstimos e Infraestrutura

Documento de especificação para implementar barganha real de mercado, sistema completo de empréstimos, níveis de infraestrutura e centro de olheiros.

---

## 1. Negociações Reais e Barganha Dinâmica

Fim das respostas binárias ("Aceitou/Recusou"). A negociação agora é um diálogo interativo de barganha.

### 1.1 Negociação entre Clubes
- Ao fazer uma oferta por um jogador, o clube vendedor responde com uma contraproposta baseada no valor de mercado, importância do atleta e reputação dos clubes.
  - Exemplo: Você oferece R$ 11.000.000. O clube responde: "Pedimos pelo menos R$ 13.800.000 para liberar o atleta."
- Permite fazer contraproposta até chegar a um acordo ou romper as conversas.

### 1.2 Negociação do Contrato do Jogador
Após fechar com o clube, você negocia diretamente com o empresário do jogador:
- **Salário Mensal:** Pedido baseado em força, idade e reputação do seu clube.
- **Luvas / Bônus de Assinatura:** Valor à vista exigido para fechar o acordo.
- **Tempo de Contrato:** 1 a 5 anos.
- **Cláusula de Rescisão:** Valor para quebra unilateral do contrato.

---

## 2. Empréstimos de Futebol Brasileiro

O sistema de empréstimos reflete o mercado nacional:

- **Divisão Salarial:** Negociar quem paga qual porcentagem da folha (ex.: 70% clube de origem / 30% seu clube, ou 50%/50%).
- **Cláusula de Vitrine:** Se o seu clube valorizar um jovem emprestado e o clube dono vendê-lo durante o período, seu time recebe **10% a 20% do valor da venda** como taxa de vitrine.
- **Opção ou Obrigação de Compra:** Valor pré-fixado para contratar em definitivo no fim do empréstimo (obrigação ativada se atingir X jogos em campo).

---

## 3. Estrutura do Clube & Investimentos Permanentes (Níveis 1 a 5)

Proporciona opções de investimentos de longo prazo para reinvestir o caixa acumulado. Cada setor pode ser melhorado do **Nível 1 ao Nível 5**:

| Estrutura | Nível Maior Garante |
|---|---|
| **Centro de Treinamento (CT)** | Evolução mais rápida de força, menor desgaste físico e teto de potencial maior. |
| **Departamento Médico (DM)** | Redução drástica da frequência e do tempo de recuperação de lesões. |
| **Centro de Análise de Desempenho** | Bônus tático de simulação contra times cujos esquemas foram estudados. |
| **Categorias de Base** | Revelação de jovens com maior força inicial e mais estrelas de potencial. |
| **Centro de Olheiros** | Permite contratar olheiros mais qualificados e cobrir regiões maiores. |

---

## 4. Rede de Olheiros (Scouting System)

Sem olheiros, você **não vê os atributos exatos** de atletas de outros times (exibir Força como uma faixa estimada, ex.: *Força 35–40*).

### 4.1 Tipos de Olheiros
- **Regional:** Descobre barganhas locais e times menores da Série B.
- **Nacional:** Mapeia todos os jogadores das Séries A e B.
- **Internacional:** Encontra talentos e sul-americanos baratos.
- **Especialista em Jovens:** Focado em promessas escondidas com alto potencial.
- **Especialistas por Posição:** Focado em encontrar goleiros, defensores ou atacantes de elite.

Quanto melhor o nível do olheiro, mais rápido e preciso é o relatório enviado.
