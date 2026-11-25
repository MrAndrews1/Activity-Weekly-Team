# ¿Quién es quién?

Juego en vivo para el weekly del equipo. Cada persona manda un dato curioso suyo y, en vivo, todos votan desde el celular de quién creen que es. Funciona igual para quien está en la sala y para quien está por videollamada.

## Cómo se juega

1. Quien dirige entra a la página, toca **Crear sala** y comparte su pantalla.
2. Los demás escanean el código QR (o abren el link que se pega en el chat), escriben su nombre y su dato curioso.
3. Al tocar **¡Empezar el juego!**, aparece un dato a la vez. Todos votan desde el celular antes de que se acabe el tiempo.
4. Se revela de quién era, quién acertó y la tabla de posiciones.
5. Al final hay podio y premios: Detective del equipo, El gran misterio y Libro abierto.

## Puntos

- Acertar: 100 puntos, más hasta 50 extra según qué tan rápido votes.
- Dueño del dato: 5 puntos por cada persona que no adivinó (máximo 100).

## Técnico

- Next.js (App Router) + TypeScript, sin librerías de UI.
- Estado compartido en Upstash Redis (Vercel Marketplace, plan gratis). Los celulares consultan el estado cada 1,5 s.
- Variables: `KV_REST_API_URL` y `KV_REST_API_TOKEN` (las crea Vercel al conectar Upstash). Sin ellas, usa memoria local, solo para desarrollo.

```bash
npm install
npm run dev
```
