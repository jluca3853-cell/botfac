# Bot Farm FiveM — Discord + MySQL

Sistema de registro de farm com:
- Nome
- Item farmado
- Quantidade
- Quem recebeu o farm
- Aprovação/reprovação
- Cargo automático ao aprovar
- Histórico MySQL
- Comandos `/painelfarm` e `/farmhistorico`

## Render
Configure as variáveis do `.env.example` em Environment Variables.
Não publique seu TOKEN no GitHub.

## Discord
O bot precisa conseguir:
- Ver canais
- Enviar mensagens
- Incorporar links/embeds
- Usar comandos de aplicação
- Gerenciar cargos (o cargo do bot deve ficar acima do cargo que ele adicionará)

O comando `/painelfarm` é restrito ao `CARGO_STAFF`.
