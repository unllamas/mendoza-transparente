# Hallazgos de seguridad

Mendoza Transparente junta datos que el Estado ya publica. No busca fallas de seguridad, no las aprovecha y no las difunde. Aun así, relevando fuentes puede aparecer algo: una carpeta abierta con planillas de beneficiarios, un sitio municipal con enlaces de casinos inyectados, un sistema que muestra datos que no debería. Cuando pasa, **se deja de mirar, se carga en el panel y se reporta a quien corresponde**. El objetivo es que los datos de la gente dejen de estar expuestos, no contarlo.

## Lo que no se hace nunca

Acceder sin autorización a un sistema o a datos de acceso restringido es delito (Código Penal, arts. 153 bis y 157 bis, Ley 26.388), y los datos personales están protegidos por la Ley 25.326. Por eso:

- **No se buscan fallas.** Nada de escaneos, pruebas de inyección, fuerza bruta, probar contraseñas ni recorrer direcciones o números de registro para ver qué aparece.
- **No se pasa ningún control de acceso:** login, captcha, claves, tokens ajenos ni enlaces que no estén publicados en el sitio.
- **No se descargan, abren de más ni guardan datos personales expuestos.** Se mira lo mínimo para entender qué es y se para.
- **No se cambia nada** en el sitio afectado.
- **No se cuenta afuera del equipo:** ni en la web, ni en GitHub (issues, PR, commits, `docs/`), ni en redes, ni en chats abiertos. Tampoco la dirección exacta.
- **Las herramientas de ingeniería inversa** (como REA) solo se usan para entender cómo una página pública pide sus datos, con lo que el navegador ya recibe al usarla de forma normal. Nunca para probar o forzar un sistema del Estado.

## Si aparece algo

1. **Parar.** No seguir navegando por ahí ni descargar nada más.
2. **Si un scraper ya lo bajó,** ese crudo no se commitea ni se sube a archive.org: es la única excepción a «`data/raw/` es de solo agregar». Si ya está en el repositorio, avisar al responsable del repositorio para decidir cómo sacarlo de la historia. Si la fuente puede volver a traerlo, el scraper se corrige o la fuente se pausa en el mismo cambio.
3. **Cargarlo en el panel:** [Seguridad → Nuevo hallazgo](https://panel.mendoza-transparente.com/seguridad). Ver «Qué se carga» más abajo.
4. **Reportarlo** a quien corresponde, ver abajo, y anotar en el panel a quién, cuándo y con qué número de ticket o expediente.
5. **Seguirlo:** si en 30 días no hay respuesta, se vuelve a reportar. Cuando se corrige, se anota la fecha.

### Agentes

Un agente no tiene acceso al panel de producción y no carga hallazgos. Si encuentra algo:

- para;
- se lo cuenta a la persona en el chat con lo mínimo (dónde, qué tipo de dato, sin copiarlo);
- no lo escribe en archivos del repositorio, commits, PR ni issues.

Un subagente lo pone en su reporte final como **hallazgo de seguridad**, con las mismas reglas, y la sesión principal se lo pasa a la persona, que lo carga en el panel.

## A quién se reporta y cómo

Cada reporte sale por escrito y queda anotado en el panel: a quién, en qué fecha y con qué número de ticket, correo o expediente.

| A quién | Cuándo | Cómo |
|---|---|---|
| El **organismo responsable** | Siempre, primero | Un correo a su área de sistemas o al contacto de transparencia del sitio. Si en 7 días no contesta, una nota por mesa de entradas, que da un número de expediente |
| **CERT.ar**, el equipo nacional de respuesta a incidentes de la Dirección Nacional de Ciberseguridad | Siempre que sea un sistema público | Correo a `reportes@cert.ar` o el formulario de [argentina.gob.ar/cert-ar](https://www.argentina.gob.ar/cert-ar). Atiende de 9 a 17, y lo crítico las 24 horas |
| La **AAIP**, autoridad de control de la Ley 25.326 | Si hay datos personales expuestos | Una nota a la Dirección Nacional de Protección de Datos Personales que avise la exposición, para que actúe de oficio. La «denuncia por incumplimiento» de Trámites a Distancia no sirve: es para quien ya reclamó por **sus propios** datos y no le respondieron |

**Mendoza todavía no tiene un equipo provincial de respuesta a incidentes.** En julio de 2026 entró a la Legislatura un proyecto de ley de ciberseguridad que crea un registro provincial de incidentes y un canal para reportar vulnerabilidades. Cuando se apruebe y el canal funcione, se suma a esta tabla. Mientras tanto, para un organismo provincial o municipal, el reporte va al organismo y a CERT.ar con copia.

### Qué dice el reporte

> **Asunto:** Aviso de un problema de seguridad en [sitio]
>
> Al relevar datos públicos para Mendoza Transparente vimos, el [fecha], que [dónde: la página o la carpeta] [qué pasa: por ejemplo, «lista planillas con nombres y documentos de beneficiarios»]. No descargamos ni difundimos nada, y no vamos a hacerlo público. Les avisamos para que lo corrijan. Para cualquier consulta, nuestro código de seguimiento es [S-…].

- **Sin los datos expuestos** y sin capturas que los muestren.
- **Sin pasos para reproducirlo** más allá de dónde está.
- **Desde la cuenta del proyecto,** no desde una personal.
- Los de gravedad alta se reportan en el día.

### Sin nada de esto en los scrapers

Los scrapers corren en GitHub Actions, con logs públicos, y sus resultados van a un repositorio público. Un scraper nunca detecta, describe ni imprime un problema de seguridad: si una fuente devuelve algo raro, falla con un mensaje genérico («la fuente devolvió algo inesperado, revisar a mano») y una persona lo mira. Los hallazgos los carga siempre una persona en el panel; nada escribe solo en esa tabla.

## Qué se carga

| Campo | Qué va |
|---|---|
| Título | Qué pasa, en pocas palabras |
| Tipo | Datos personales expuestos, falla de seguridad, configuración insegura, sitio comprometido u otro |
| Gravedad | Alta, media o baja |
| Organismo responsable | Quién tiene que arreglarlo |
| Dirección | La página o la carpeta, **no** el archivo con los datos |
| Expone datos personales | Si quedan expuestos datos de la gente |
| Descripción | Cómo se llega y qué **tipo** de dato queda expuesto («nombres y DNI de beneficiarios»). Nunca los datos |
| Reporte | Estado, a quién se reportó, fecha, número de ticket o expediente y fecha de corrección |

**Estados:** Sin reportar → Reportado → Confirmado por el organismo → Corregido (o Descartado, si no era un problema).

## Cómo lo cuida el panel

- La tabla `security_findings` (migración `0003`) **no se publica nunca:** no tiene campo de publicación, ninguna consulta pública la lee y no sale en el CSV de la bandeja. Hay pruebas que fallan si aparece en el registro o en la exportación.
- Los códigos son `S-` más 8 caracteres al azar. Las rutas públicas no aceptan esos códigos.
- Si el título o la descripción parecen tener un correo, un teléfono, un DNI o un CUIL, la API pide confirmar que no son datos de nadie.
- Para marcar un hallazgo como reportado, hay que cargar a quién y en qué fecha.
- Cada alta y cada cambio quedan en la auditoría con quién lo hizo y qué campos cambió, **no el texto**, para no duplicar lo sensible.
- El inicio del panel avisa cuando hay hallazgos sin reportar.
- La dirección solo acepta links http(s).

Código: `packages/participation/src/security.ts` (consultas), la ruta `/api/panel/security` en `panel-api.ts` y la pantalla `apps/panel/src/pages/security.tsx`.

## Si se quiere contar

No se publica. Si alguna vez se quiere contar un caso, se decide aparte, con el problema ya corregido y sin detalles que permitan repetirlo.
