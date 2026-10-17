# Plan: consentimiento de cookies

Objetivo: saber **cuánta gente vuelve** al sitio, algo que hoy no se puede medir, pidiendo permiso de una forma que se entienda en diez segundos. Quien no acepta sigue usando el sitio igual y se sigue contando como hoy.

Fecha: 17/10/2026. Estado: propuesta, sin empezar. Falta decidir las preguntas abiertas del final.

## Por qué

- **Hoy no hay "visitantes que vuelven".** PostHog corre sin cookies (`cookieless_mode: "always"`, ver `docs/procesos/analitica.md`): arma el visitante con un hash que cambia todos los días. Cada persona cuenta como nueva cada día, y el gráfico «Returning visitors» queda siempre en cero.
- **Para medirlo hay que guardar algo en el navegador**, y eso se pide antes de hacerlo.
- **Los avisos de cookies de siempre no informan:** nadie los lee, se acepta para sacarlos de encima o se rechaza si el botón está a mano. Este sitio pide transparencia al Estado y tiene que dar el ejemplo: un aviso corto, honesto y con "no" tan fácil como "sí".

## Qué se guarda

| Grupo | Qué es | ¿Se puede apagar? |
|---|---|---|
| **Necesarias** | El modo claro u oscuro (`localStorage`, ya existe en `theme-toggle.tsx`) y la elección sobre este aviso. No salen del navegador. | No: el sitio las necesita y no identifican a nadie. |
| **Medición** | Un identificador al azar de PostHog, para saber si el navegador ya vino antes. No lleva nombre, correo ni IP. | Sí. Apagado hasta que la persona acepta. |

No hay publicidad, ni píxeles de redes, ni nada de terceros más allá de PostHog. Si algún día se suma algo, entra como grupo nuevo y se vuelve a preguntar.

## Cómo funciona

- **Sin elección, como hoy:** PostHog sigue en modo sin cookies. El conteo diario no se pierde aunque nadie acepte.
- **Al aceptar:** PostHog pasa a guardar su identificador y, desde ahí, distingue a quien vuelve. La configuración candidata es `cookieless_mode: "on_reject"` con `opt_in_capturing()` al aceptar y `opt_out_capturing()` al rechazar (sin cookies hasta que hay "sí"). Hay que confirmar en la documentación de `posthog-js` instalada que se comporta así antes de implementarlo.
- **Al rechazar:** sigue sin cookies, igual que hoy. Rechazar no rompe nada ni esconde contenido.
- **La elección** se guarda en `localStorage` (`mt-consent`) con la versión del aviso y la fecha. Si cambia lo que se guarda, se sube la versión y se vuelve a preguntar.
- **Se puede cambiar cuando se quiera:** link «Cookies» en el pie, que abre las mismas opciones. Retirar el permiso borra el identificador de PostHog.
- Todo vive en `apps/web/src/analytics.ts` y un componente de aviso. El resto del sitio sigue llamando a `track()` sin saber nada del consentimiento.

## El aviso (lo que ve la persona)

Una barra chica abajo, que no tapa el contenido ni bloquea la página. Textos propuestos:

> **Una pregunta sobre cookies.** Para saber si la gente vuelve al sitio, queremos guardar un número al azar en tu navegador. No sabemos quién sos ni lo usamos para publicidad.
>
> [Aceptar] [Rechazar] · Ver detalle

- **«Aceptar» y «Rechazar» iguales:** mismo tamaño, mismo estilo, uno al lado del otro. Nada preseleccionado, nada en gris para que pase desapercibido.
- **«Ver detalle»** abre una hoja (`Sheet`) con los dos grupos de la tabla de arriba, «Necesarias» siempre activa y «Medición» con un interruptor, más un botón «Guardar».
- **Arriba de la hoja, qué es una cookie en una línea:** «Una cookie es un dato chiquito que un sitio guarda en tu navegador para reconocerlo la próxima vez, como el sello en la mano a la entrada de un recital.»
- **Cerrar el aviso sin elegir** no cuenta como aceptar: se sigue sin cookies y se vuelve a preguntar en la próxima visita.
- Una página corta (`/privacidad`, a decidir) con lo mismo en detalle: qué se mide, con qué proveedor, cuánto dura el identificador y cómo se borra.

Reglas de `docs/procesos/diseno.md` que aplican: 44 px para tocar, acción visible sin hover, hoja modal para el detalle, textos con voseo y sin jerga ("identificador al azar", no "ID persistente").

## Medición del propio aviso

Eventos `consent.banner.accept`, `consent.banner.reject`, `consent.banner.detail` y `consent.settings.save` (con `measurement: true/false`), que se envían sin cookies como el resto. Sirven para saber cuánta gente acepta y si el aviso molesta. Van al catálogo (`analytics-catalog.ts`) como cualquier evento.

## Etapas

1. Decidir las preguntas abiertas.
2. Confirmar el comportamiento de `cookieless_mode: "on_reject"` en `posthog-js`.
3. Aviso, hoja de detalle, link en el pie y página de privacidad. Probar con `estresar-interfaz` a 320 px y con el menú móvil abierto.
4. Pasar a `docs/procesos/analitica.md` (sección "Consentimiento") y actualizar la skill `analitica`, que hoy dice que no hace falta banner.

## Preguntas abiertas

- **¿Vale la pena?** El aviso agrega fricción a todas las visitas nuevas a cambio de un solo dato (quién vuelve). Alternativa sin aviso: mirar páginas por visitante en el día y eventos de intención (buscador, «Compartir»).
- **Cuándo aparece:** apenas entra la persona, o después de la primera interacción o de unos segundos, para no tapar lo primero que se lee en el celular.
- **Cuánto dura el identificador:** el de PostHog dura un año. Se puede acortar.
- **Marco legal:** revisar la Ley 25.326 de Protección de Datos Personales y las guías de la AAIP. El estándar europeo (consentimiento previo, rechazo tan fácil como aceptación) se toma como piso de buenas prácticas.
