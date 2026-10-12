# Diccionario de datos

Cada CSV de `data/processed/<fuente>/<archivo>.csv` tiene al lado un `<archivo>.meta.json` que le explica a la web, y a cualquier persona, qué es cada columna y cómo mostrarla. Sin ese archivo, la web muestra la tabla cruda.

## Formato

```json
{
  "titulo": "Adjudicaciones de compras",
  "descripcion": "Cada fila es un proveedor que ganó (todo o parte de) un proceso de compra del Estado provincial en COMPR.AR.",
  "columnas": {
    "ocid": {
      "etiqueta": "N.º de proceso",
      "tipo": "texto",
      "quitarPrefijo": "ocds-ppv9mm-",
      "descripcion": "Identificador del proceso en COMPR.AR."
    },
    "fecha_adjudicacion": { "etiqueta": "Fecha", "tipo": "fecha" },
    "proveedor_nombre": { "etiqueta": "Proveedor", "tipo": "texto" },
    "proveedor_cuit": { "etiqueta": "CUIT", "tipo": "texto" },
    "monto": { "etiqueta": "Monto adjudicado", "tipo": "moneda", "moneda": "ARS", "escala": 1 },
    "moneda": { "oculta": true },
    "proveedores_en_adjudicacion": {
      "etiqueta": "Proveedores en el proceso",
      "tipo": "numero",
      "descripcion": "Cuántos proveedores se repartieron este proceso. Si es más de uno, el monto se dividió en partes iguales."
    }
  },
  "orden": ["fecha_adjudicacion", "proveedor_nombre", "monto", "ocid", "proveedor_cuit", "proveedores_en_adjudicacion"]
}
```

### Campos del archivo

- `titulo`: nombre corto y claro, en castellano llano. No el nombre del archivo.
- `descripcion`: una o dos oraciones. Qué representa **cada fila** y de dónde sale. Cualquier advertencia importante (montos nominales, quiebres de serie, unidades).
- `columnas`: una entrada por columna del CSV. Si falta una columna, la web la muestra con su nombre crudo.
- `orden` (opcional): columnas en el orden en que conviene leerlas, de lo más importante a lo más técnico. Las columnas no listadas van al final.

### Campos de cada columna

| Campo | Uso |
|---|---|
| `etiqueta` | Nombre legible para el encabezado ("Monto adjudicado", no "monto"). Corto. |
| `tipo` | `texto`, `numero`, `moneda`, `fecha`, `anio`, `mes`, `porcentaje`, `booleano` |
| `descripcion` | Opcional. Se muestra al pasar el mouse por el encabezado. Para todo lo que no sea obvio. |
| `oculta` | `true` para columnas puramente técnicas o redundantes (por ejemplo `moneda` si ya está en el tipo, el nombre del archivo de origen, hashes). |
| `moneda` | Solo para `tipo: moneda`: `ARS` o `USD`. Si la moneda cambia fila a fila, usar `monedaColumna` con el nombre de la columna que la indica. |
| `escala` | Para `moneda` y `numero`: por cuánto hay que multiplicar el valor del CSV para llegar a unidades. `1` si ya está en pesos/dólares, `1000` si está en miles, `1000000` si está en millones. |
| `quitarPrefijo` | Para `texto`: prefijo técnico a sacar al mostrar. |
| `unidad` | Para `numero`: texto corto que va después del valor ("cargos", "‰", "hab."). |
| `valores` | Para `texto`: traducción de códigos a texto legible, por ejemplo `{"active": "En curso"}`. Los códigos en `snake_case` sin traducción se muestran como texto normal ("petroleo_crudo" → "Petroleo crudo"). |

Para `porcentaje`, usar `escala: 100` si el CSV trae una fracción (0,25 = 25 %) y `escala: 1` si ya trae el porcentaje.
