# ISSF FINALS — simulador de finales de tiro olímpico

Reescritura del simulador de finales de `olympic-shooting-game/simulador`.
Un solo archivo (`index.html`), sin dependencias ni assets externos: se abre
haciendo doble clic y funciona sin conexión.

> **Nota sobre este directorio.** El destino real de este código es el repo
> `ec600-arg/olympic-shooting-game`, carpeta `/simulador`. Vive acá de forma
> temporal porque la sesión no tenía acceso a ese repositorio.

## Qué cubre

| | |
|---|---|
| **Pruebas** | 10 m rifle de aire · 10 m pistola de aire |
| **Formatos** | Final individual (8 finalistas, 24 disparos) · Equipo mixto (match a 16 puntos) |
| **Puntuación** | Decimal en ambas pruebas, como manda el reglamento vigente de finales |
| **Niveles** | Club · Nacional · Copa del Mundo · Juegos Olímpicos |
| **Control** | Mantener y soltar · Clic simple · Automático (espectador) |
| **Idiomas** | Español · Inglés (interfaz, reglamento y voces) |

## Reglamento implementado

**Final individual.** Dos series de tres disparos por orden del juez; después,
disparos individuales de 50 s. Tras el disparo 12 y cada dos disparos se
elimina al último clasificado. Los dos que sobreviven definen el oro en los
disparos 23 y 24. Desempate por mejor último disparo y luego por dieces
centrados.

**Equipo mixto.** Dos parejas de un hombre y una mujer. Cada serie tiran los
cuatro; la suma más alta se lleva la serie (2 puntos; empate, 1 y 1). Gana el
primer equipo que llega a 16.

## Balística

El puntaje sale de la geometría oficial del blanco, no de una tabla inventada.
Se puntúa por el borde del balín (4,5 mm de diámetro), y como el radio del
balín es exactamente la diferencia entre el paso del anillo y el radio del
diez, la cuenta se reduce a:

```
entero  = 10 − ⌊d / ringStep⌋
decimal = 10,9 − ⌊d / (ringStep/10)⌋ × 0,1
```

`d` es la distancia del centro del impacto al centro del blanco, en mm.
`ringStep` vale 2,5 mm en rifle y 8,0 mm en pistola.

El impacto se genera con una gaussiana bidimensional alrededor del punto de
mira, cuyo desvío depende del nivel del tirador, la fatiga, la forma del día y
la presión del momento.

### Calibración

Los parámetros están ajustados contra resultados reales de finales ISSF:

| | Simulador | Realidad |
|---|---|---|
| Rifle — oro (24 disparos) | 251,8 de media | 250–253 |
| Rifle — 8.º a los 12 disparos | 122,9 | 123–124 |
| Pistola — oro (24 disparos) | 242,6 de media | 240–245 |
| Pistola — 8.º a los 12 disparos | 116,0 | 116–118 |

Los ocho finalistas están separados por unas dos décimas por disparo, que es
la diferencia real entre el primero y el octavo de una final olímpica. El
drama sale de la varianza y de los nervios, no de la brecha de nivel.

## Pulso y disparo del jugador

El punto de mira nunca está quieto. Se compone de un balanceo lento, un
temblor rápido y la respiración, que empuja en vertical salvo en la pausa
respiratoria. La estabilidad sigue la curva clásica del sostén:

- **0 – 1,8 s** — asentando
- **1,8 – 6 s** — ventana óptima
- **6 s en adelante** — deterioro rápido

Soltar tarde cuesta entre dos y cuatro décimas por disparo, igual que en el
polígono.

## Audio

Todo se sintetiza con Web Audio; no hay un solo archivo de sonido.

- **Música adaptativa** — secuenciador con *lookahead* sobre el reloj del
  `AudioContext`. Sub-bajo, bombo, hi-hats, arpegio filtrado y pad. Un
  parámetro de tensión abre el filtro, sube el tempo y densifica la
  percusión conforme se acercan las eliminaciones.
- **Efectos** — el disparo son tres capas (aire, golpe de pistón y muelle) y
  el impacto en el blanco entra 59 ms más tarde, que es lo que tarda el balín
  en recorrer los 10 m. Ese desfase es lo que hace que suene a polígono.
- **Público** — murmullo continuo de ruido filtrado, con ovaciones y «oooh»
  de decepción construidos con cientos de micro-ráfagas.
- **Voces** — `SpeechSynthesis` con dos personajes: el juez de campo (grave y
  pausado) y el relator (más ágil). Los puntajes se transcriben para que se
  lean bien: `10.9` → «diez coma nueve».

## Controles

| Tecla | Acción |
|---|---|
| `Espacio` | Mantener para apuntar, soltar para disparar |
| `R` | Repetición en cámara lenta del último disparo |
| `M` / `V` | Música / voz |
| `Esc` | Abandonar la final |

También se puede mantener presionado directamente sobre el blanco.

## Estructura del código

`index.html` es un archivo autocontenido dividido en secciones comentadas:

```
§1  Utilidades y estado global      §7  Atletas (jugador e IA)
§2  Textos (ES / EN)                §8  Máquina de estados de la final
§3  Pruebas y plantel               §9  Render (blanco, ECG, tablero)
§4  Motor de audio                  §10 Interfaz
§5  Motor de voz                    §11 Arranque y cableado
§6  Balística
```

El estado vive en `ST`; la partida activa, en `ST.match`. Ambos son
inspeccionables desde la consola del navegador.
