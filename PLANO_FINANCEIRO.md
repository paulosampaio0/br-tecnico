# BR Técnico — Plano do Sistema Financeiro e de Mercado

Complemento do `PLANO_BR_TECNICO.md`. Documento de especificação para o
Claude Code construir a parte econômica do jogo.

**Princípio geral:** o dinheiro precisa ser **apertado**. Se sobra caixa, não há
decisão. O jogo bom é aquele em que o técnico sempre quer contratar alguém que
não cabe no orçamento.

---

## 1. A moeda e o ponto de partida

- Moeda do jogo: **Real (R$)**, em milhões.
- Os dados já trazem `valor_mi` (valor de mercado real em milhões de €).
  Converter para reais na importação usando uma taxa fixa definida no código
  (fácil de ajustar depois).
- **Caixa inicial de cada clube** é calculado, não digitado: sai do porte do
  clube (soma dos valores do elenco + divisão). Um clube da Série A começa com
  caixa maior que um da Série B.

---

## 2. Entradas de dinheiro (receitas)

| Fonte | Como funciona |
|---|---|
| **Cota de TV** | Valor fixo por divisão, pago por rodada. Série A paga bem mais que a B. É a receita mais estável. |
| **Bilheteria** | Só em jogos em casa. Depende do público, que varia com: desempenho recente do time, importância do jogo, tamanho da torcida do clube e preço do ingresso definido pelo técnico. |
| **Patrocínio** | Contrato de temporada. O valor oferecido depende da divisão, do prestígio e do desempenho na temporada anterior. |
| **Premiação** | Pago por colocação no fim do campeonato e por acesso à divisão superior. |
| **Venda de jogadores** | A maior fonte de dinheiro grande. Ver seção 4. |

**Alavanca do técnico:** o **preço do ingresso**. Preço alto = mais receita por
pessoa, mas menos público e queda de moral da torcida. Preço baixo = estádio
cheio, torcida feliz, receita menor. Decisão real, com trade-off.

---

## 3. Saídas de dinheiro (despesas)

| Fonte | Como funciona |
|---|---|
| **Folha salarial** | Pago **toda rodada**. É a maior despesa e cresce sozinha conforme o elenco melhora. |
| **Custos fixos** | Manutenção do clube, estrutura, viagens. Valor por rodada ligado ao porte. |
| **Luvas de contratação** | Valor pago à vista ao contratar (além do salário). |
| **Multas** | Ao demitir jogador antes do fim do contrato, ou rescindir. |

**Salário não é digitado:** é calculado automaticamente de **força + idade**
(conforme já definido no plano principal). Jogador forte e jovem custa caro;
veterano forte custa caro em salário mas barato em valor de compra.

---

## 4. Mercado de transferências

### 4.1 Janelas
Duas janelas por temporada: uma antes do início e uma no meio. Fora delas,
não se contrata. Isso obriga a planejar.

### 4.2 Preço de um jogador
O valor de compra sai de uma fórmula com estes ingredientes:
- **Força** (peso maior)
- **Idade** (jovem custa mais caro; a partir de ~30 o preço despenca)
- **Potencial / promessa** (joia jovem tem preço inflado)
- **Tempo de contrato restante** (contrato acabando = barato; contrato longo = caro)
- **Situação do clube vendedor** (clube endividado vende mais barato)

### 4.3 Negociação
- O técnico faz uma **proposta**. O clube dono aceita, recusa ou faz contraproposta.
- Proposta muito abaixo do valor = recusa direta.
- O **jogador** também decide: se o salário oferecido for baixo demais ou o clube
  for pequeno demais para ele, recusa mesmo com os clubes acordados.

### 4.4 Vender
- Clubes da IA fazem **propostas espontâneas** pelos seus jogadores. Aceitar ou
  não é decisão sua — vender o craque salva o caixa mas enfraquece o time.
- Você também pode **colocar jogador na lista de dispensa** para forçar saída e
  aliviar a folha.

### 4.5 Contratos
- Todo jogador tem **duração de contrato** e **salário**.
- Contrato acabando precisa ser renovado, e o jogador pede aumento proporcional
  à força atual. Se não renovar, ele sai **de graça** no fim da temporada.
- Isso cria o dilema clássico: renovar caro ou vender agora por algum dinheiro.

---

## 5. Saúde financeira do clube

- Um painel simples mostra: **caixa atual**, **receita por rodada**,
  **despesa por rodada** e **saldo previsto no fim da temporada**.
- **Caixa negativo** tem consequências reais, em escala:
  1. Aviso da diretoria.
  2. Bloqueio de contratações.
  3. Venda forçada de jogadores pela diretoria (ela escolhe, não você).
  4. Demissão.
- Isso mantém a pressão sem quebrar o jogo.

---

## 6. Diretoria e metas

- No início da temporada, a diretoria define uma **meta** (ex.: "ficar entre os
  10 primeiros", "não cair", "subir de divisão") e um **orçamento de contratações**.
- Cumprir a meta = mais orçamento e mais paciência na temporada seguinte.
- Falhar = corte de verba ou demissão.
- Isso conecta o financeiro ao desempenho em campo, que é o que faz o sistema
  todo fazer sentido.

---

## 7. Categoria de base (opcional, fase posterior)

- Investimento mensal opcional em base.
- De tempos em tempos surge um jovem com estrelas de potencial — jogador de
  graça, sem custo de compra, só salário.
- É a saída financeira dos clubes pequenos e um ótimo motivo para o jogador
  continuar jogando temporadas seguidas.

---

## 8. Telas novas necessárias

1. **Finanças** — caixa, receitas, despesas, gráfico simples de saldo, e o
   controle de preço do ingresso.
2. **Mercado** — buscar jogadores por posição, idade, força e preço; fazer
   propostas; ver propostas recebidas.
3. **Contratos** — lista do elenco com salário e tempo de contrato restante,
   com alerta nos que estão acabando.

---

## 9. Ordem de construção (fases)

Estas fases entram **depois** da Fase 7 do plano principal (evolução de
jogadores), porque o financeiro depende de força, idade e salário já funcionando.

- **Fase 9 — Base financeira:** caixa, folha salarial, custos fixos e cota de TV
  descontados/creditados a cada rodada. Tela de Finanças mostrando os números.
- **Fase 10 — Bilheteria e patrocínio:** público, preço do ingresso e contrato
  de patrocínio.
- **Fase 11 — Contratos:** duração, renovação, pedido de aumento, saída de graça.
- **Fase 12 — Mercado (comprar):** janela, busca de jogadores, cálculo de preço,
  proposta e negociação.
- **Fase 13 — Mercado (vender):** propostas da IA pelos seus jogadores, lista de
  dispensa.
- **Fase 14 — Diretoria:** metas, orçamento, consequências de caixa negativo e
  demissão.
- **Fase 15 — Base:** categoria de base e surgimento de joias.

---

## 10. Como pedir isso ao Claude Code

Depois de terminar a Fase 7 do plano principal, abra o Claude Code na pasta
`br-tecnico` e diga:

> Leia o arquivo `PLANO_FINANCEIRO.md` nesta pasta. Ele é o complemento do
> `PLANO_BR_TECNICO.md` e descreve o sistema financeiro do jogo. Não escreva
> código ainda — primeiro me explique, em linguagem de não-programador, como
> você pretende encaixar isso no que já está feito e se vê algum problema.
> Depois vamos fazer só a **Fase 9**.

Mantenha a mesma regra de ouro: **uma fase por vez**, testar antes de avançar,
e salvar no Git ao fim de cada fase.

---

## 11. Ajuste de dificuldade (para depois de tudo pronto)

Quando estiver jogando, os números vão parecer errados na primeira vez — é
normal e esperado. Anote o que sentiu (ex.: "sobra dinheiro demais", "impossível
contratar ninguém") e peça ao Claude Code para ajustar os multiplicadores de
receita e despesa. Todos eles devem ficar **num único arquivo de configuração**,
justamente para você poder equilibrar o jogo sem mexer no código.
