# 27

Aplicación personal para registrar hábitos, formación elegida por ti, notas académicas y experiencias puntuales. Los cuatro ámbitos mantienen historiales y estadísticas separados.

## Abrir la app

La versión web está disponible en [Abrir 27](https://valprimos.github.io/27/index.html). También puedes instalarla desde el navegador del móvil como una app web progresiva (PWA).

## Ejecutar en Mac

La aplicación no necesita instalar paquetes ni usar una cuenta. Desde la carpeta del proyecto, inicia un servidor local:

```bash
python3 -m http.server 8000
```

Abre <http://localhost:8000> en el navegador. La primera carga necesita conexión; después, la interfaz básica queda disponible sin conexión.

## Datos y privacidad

- Los registros se guardan en el almacenamiento local del navegador de cada dispositivo.
- La app no envía tus registros a GitHub ni a un servidor de 27. GitHub puede recibir solicitudes normales de carga de la página y sus archivos.
- Usa **Configuración → Exportar todos mis datos** para hacer copias o mover datos entre dispositivos; importar sustituye los datos locales actuales.
- Repaso: juego de preguntas sobre las citas, datos curiosos y palabras de inglés que van saliendo (autor de una cita, completar citas y datos, significado y uso de las palabras). Prioriza lo que nunca se ha respondido o se ha fallado, y marca como dominado lo que se acierta 3 veces seguidas. Código en `src/quiz.js`.
- Sincronización entre dispositivos (opcional, gratis): guarda los datos cifrados en un repositorio privado de GitHub. Se activa en Configuración → Sincronización.
  1. Crea un repositorio **privado** para los datos (por ejemplo `27-datos`, con README).
  2. Crea un token de acceso fine-grained limitado a ese repositorio con el permiso *Contents: Read and write*.
  3. Elige una contraseña de cifrado (la misma en todos los dispositivos; no se puede recuperar).
  Los datos se cifran en el navegador (PBKDF2 + AES-GCM) antes de subirse a `datos-27.json`. La fusión se hace por registro: gana el cambio más reciente.
- El código fuente y los documentos del repositorio son públicos; no guardes secretos ni datos personales aquí.

El sitio se sirve por HTTPS. En iPhone, ábrelo en Safari y usa **Compartir → Añadir a pantalla de inicio**. En Android, abre el enlace en Chrome y selecciona **Instalar app** o **Añadir a pantalla de inicio**.

## Funciones incluidas

- Hábitos diarios, por días concretos o varias veces por semana; exclusiones por fecha; pausa, archivo, edición y eliminación.
- Registro independiente de sesiones en Matemáticas personal, Inglés personal, Python y otras áreas.
- Asignaturas y notas de exámenes y evaluaciones, medias normalizadas sobre 10 y evolución por asignatura.
- Extras editables que no afectan a hábitos, rachas ni porcentaje diario.
- Calendario, ánimo, reflexiones con guardado automático, objetivos, estadísticas basadas en registros y copias JSON.
- **Selector de día** en *Hoy*: tira con los últimos 14 días, flechas, calendario para fechas antiguas y aviso claro cuando registras un día pasado. No se pueden registrar días futuros.
- **Contenido diario** que cambia cada día: cita (con autor y obra), dato curioso (con enlace para consultarlo) e inglés del día. Solo se ve el de hoy y el de días ya pasados; el archivo muestra lo que ya ha salido y tus favoritos. El contenido está en `src/contenido.js`, listo para ampliar.
- **Apariencia** en Configuración: modo claro/oscuro/sistema, 8 paletas de color (Bosque, Océano, Atardecer, Lavanda, Rosa, Café, Turquesa, Grafito) y tres tamaños de texto.
- Diseño adaptable a Mac y móvil, manifest PWA y caché local de la interfaz.

## Especificación

Los requisitos completos están en [docs/REQUISITOS.md](docs/REQUISITOS.md).
