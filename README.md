# Circuito – timer de treino

Timer ajustável para treinos em circuito. Funciona direto no navegador (celular ou computador), sem instalação, sem dependências e sem build.

## Recursos

- **Quantidade de exercícios**, **duração de cada um** e **tempo de descanso** ajustáveis.
- Opções extras: número de voltas do circuito e contagem inicial ("Prepare-se").
- **Avisos sonoros** (Web Audio, sem arquivos de áudio):
  - início do exercício: dois beeps curtos + um longo e agudo;
  - fim do exercício: dois tons descendentes (início do descanso);
  - últimos 3 segundos de cada etapa: tique por segundo;
  - fim do treino: arpejo de conclusão.
- Vibração em celulares compatíveis e botão para silenciar.
- Tela de cores por etapa (exercício, descanso, preparação), anel de progresso e barra do treino total.
- Pausar, retomar, pular etapa e encerrar.
- Mantém a tela ligada durante o treino (Wake Lock API).
- Lembra suas últimas configurações (`localStorage`).
- PWA: pode ser instalado na tela inicial e funciona offline.

## Como usar localmente

Abra o `index.html` no navegador. Para testar o modo offline/PWA, sirva a pasta por HTTP:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie os arquivos:
   ```bash
   git init
   git add .
   git commit -m "Timer de circuito"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/circuito-timer.git
   git push -u origin main
   ```
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`.
4. Após alguns minutos o app estará em `https://SEU-USUARIO.github.io/circuito-timer/`.

> Dica: no celular, abra o link e use "Adicionar à tela inicial" para instalar.

## Estrutura

```
circuito-timer/
├── index.html
├── css/style.css
├── js/app.js
├── sw.js                  # cache offline
├── manifest.webmanifest   # PWA
├── icon.svg
├── LICENSE
└── README.md
```

## Personalização

- Valores padrão: constante `DEFAULTS` em `js/app.js`.
- Sons: objeto `sounds` em `js/app.js` (frequência, duração e tipo de onda).
- Cores das etapas: variáveis `--work`, `--rest` e `--prep` em `css/style.css`.
- Ao alterar arquivos já publicados, mude `CACHE` em `sw.js` (ex.: `circuito-v2`) para forçar a atualização do cache.

## Observações

- Navegadores só liberam áudio após um toque do usuário; por isso o som é ativado ao tocar em **Iniciar treino**.
- Com a tela bloqueada, alguns celulares pausam os sons. O app pede para manter a tela ligada, mas mantenha o navegador em primeiro plano.

## Licença

MIT
