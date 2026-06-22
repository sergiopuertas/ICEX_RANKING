# Ranking Becas ICEX — 50ª Promoción

Web estática (sin build) para que los becarios de la 50ª Promoción introduzcan
su nota y sus preferencias de destino, vean un ranking en vivo y una
estimación de a qué destino podrían acceder, basada en los datos públicos
reales de la **49ª Promoción** (resolución provisional de octubre de 2025).

No tiene relación oficial con ICEX. Es una herramienta de comunidad.

## 1. Crear la base de datos (Supabase, gratis)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo
   (elige una región cercana, p. ej. `eu-west`).
2. Ve a **SQL Editor → New query**, pega todo el contenido de
   [`sql/schema.sql`](sql/schema.sql) y pulsa **Run**.
   - Esto crea la tabla `entries` (no accesible directamente: ni lectura ni
     escritura pública), la vista `ranking` (solo lectura, sin el código
     personal de nadie) y las funciones `create_entry`, `update_entry`,
     `delete_entry`, `get_my_entry` (únicas vías de escritura, protegidas con
     el código personal de cada persona, guardado siempre cifrado con
     bcrypt).
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key (la clave **pública**, no la `service_role`)
4. Pégalas en [`js/config.js`](js/config.js):

   ```js
   export const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   export const SUPABASE_ANON_KEY = "TU-CLAVE-ANON-PUBLICA";
   ```

   La `anon key` está pensada para ir incrustada en el frontend — la
   seguridad la dan las políticas RLS y las funciones del paso 2, no el
   secretismo de esa clave.

## 2. Probar en local

Los módulos ES requieren servirse por HTTP (no funciona abriendo el archivo
directamente con `file://`). Desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
# o: npx serve .
```

Y abre `http://localhost:8080`.

## 3. Desplegar en GitHub Pages

1. Crea un repositorio en GitHub y sube todo el contenido de esta carpeta
   (incluido `js/config.js` ya con tus claves).
2. En el repositorio: **Settings → Pages → Build and deployment** → Source:
   `Deploy from a branch` → Branch: `main` / carpeta `/ (root)`.
3. Espera 1–2 minutos: tu web quedará publicada en
   `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.

GitHub Pages solo sirve los archivos estáticos; toda la lógica de guardar,
editar y borrar entradas vive en Supabase, así que aguanta tráfico normal sin
ningún servidor propio que mantener.

## 4. Actualizar las plazas si ICEX publica datos de la 50ª

Por ahora, las plazas de referencia (`data/destinos.json`) son las mismas
275 plazas/92 destinos de la 49ª Promoción, usadas como estimación. Si ICEX
publica una convocatoria de destinos distinta para la 50ª, edita
`plazas_2025` en ese archivo (no requiere tocar la base de datos).

## Cómo funciona el cálculo (resumen)

- **Nota final (sobre 100)** = 85% nota del máster + 10% idioma + 5% TICs.
  - Nota del máster = (nota conocida × 53 + puntos del TFM × 7) / 60.
    TFM apto = 100 puntos en sus 7 créditos; suspenso o pendiente = 0.
  - Idioma: sin acreditar = 0, B2 = 50, C1 = 75, C2 = 100.
  - El cálculo se hace en la base de datos (columna generada en Postgres),
    así que el ranking siempre es consistente aunque cambie el frontend.
- **Destino estimado hoy**: simulación en vivo — se ordena a todo el mundo
  por nota y se reparten las 275 plazas de referencia en ese orden, dando a
  cada persona su primera preferencia con plazas libres en ese momento.
  Cambia cada vez que alguien se apunta, edita o se borra.
- **Demanda del mapa**: nº de personas que han puesto cada destino entre sus
  preferencias (en cualquier posición) frente a sus plazas de referencia.
  En rojo cuando las solicitudes superan las plazas.
- **Probabilidad por destino**: se compara tu puesto relativo este año con
  la franja de puestos equivalente en la 49ª Promoción real, y se calcula
  qué porcentaje de esas personas acabó en cada destino. Es una estimación
  estadística simple, no una proyección oficial.

## Privacidad

El histórico (`data/historico.json`) usado para las probabilidades **no
contiene DNI, NIE ni ningún dato identificativo** de los becarios de la 49ª
Promoción — solo puesto, nota y destino, ya públicos en la resolución oficial.
Tampoco se pide a los usuarios actuales ningún dato real (nombre, DNI,
correo): solo un alias y un código personal inventados por ellos mismos.

## Estructura del proyecto

```
index.html         Formulario: alta, edición y baja de tu entrada
dashboard.html      Ranking en vivo, mapa de demanda y probabilidades
css/styles.css      Estilos
js/config.js        Claves de Supabase y parámetros del baremo (edítalo)
js/supabaseClient.js
js/scoring.js       Fórmula de la nota (replica el cálculo de la BD)
js/probabilidad.js  Cálculo de probabilidad por destino
js/formulario.js    Lógica de index.html
js/dashboard.js     Lógica de dashboard.html
data/destinos.json  92 destinos, plazas de referencia y coordenadas
data/historico.json Ranking histórico anonimizado (49ª Promoción)
sql/schema.sql      Esquema completo de Supabase
```
