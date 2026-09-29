# OTC · Visado web

Aplicación de conformidad de órdenes de trabajo de cómputo: React/Vite, Node.js/Express y MariaDB. La portada `/` es el acceso autenticado del personal de soporte; tras entrar, un técnico ve sus OTC publicadas y puede generar o renovar un QR. El enlace lleva al solicitante a `/conformidad/{request_uuid}#token={token}`. La firma manuscrita se almacena como PNG en una transacción que cierra la solicitud y crea un evento pendiente para el sistema local. **No es una firma digital certificada.**

## Despliegue

Requiere Node.js 20.19+, MariaDB/MySQL con InnoDB, HTTPS y un proceso Node persistente detrás del proxy del hosting.

1. Cree una base OTC dedicada y aplique `schema.sql` sobre ella tras un respaldo. Si las tres tablas OTC antiguas ya existen, aplique **solo** `migrations/002_support_portal.sql` después de respaldar; no repita `schema.sql` esperando que `CREATE TABLE IF NOT EXISTS` agregue columnas.
2. Configure las variables de `.env.example` como secretos privados del servidor. Nunca suba `.env` al repositorio. `OTC_SITE_ORIGIN` debe ser el origen HTTPS exacto. No active el relay hasta que el receptor local esté listo.
3. En Hostinger seleccione aplicación **Node.js/Other**, comando de build `npm run build`, directorio de salida `build` y archivo de entrada **`server.js`**. Ejecute `npm ci`, `npm run build` y `npm start` desde la raíz del proyecto. Configure el proxy del hosting para enviar las rutas HTTP al puerto Node definido en `PORT`; ajuste `HOST` a la interfaz que requiera el proveedor.
4. Cuando se haya probado el receptor local, configure `OTC_RELAY_URL` con la URL vigente de ngrok terminada en `/otc/events`, comparta la misma clave HMAC con el receptor, active `OTC_RELAY_ENABLED=true` y programe `npm run relay` con cron sin ejecuciones simultáneas.

El panel de soporte usa sesión HTTP-only, hashes bcrypt sincronizados desde PostgreSQL local, permisos `TECH`/`ADMIN` y auditoría de renovación de QR. El token claro se muestra una sola vez; al renovar, el QR anterior deja de servir. Para poblar las cuentas con el mismo usuario y contraseña local, ejecute **desde el backend local** `python scripts/otc_sync_cloud_users.py` en vista previa y luego `--apply` cuando la conexión remota y los permisos estén comprobados. Solo sincroniza usuarios autorizados para Informática con contraseña bcrypt; no exporta contraseñas heredadas en texto plano. El publicador local también debe estar actualizado para enviar `technician_local_id` con las nuevas OTC. Las OTC antiguas sin ese vínculo solo serán visibles al administrador hasta una conciliación.

La corrección del contenido de una OTC pendiente todavía debe hacerse desde el sistema local y requerirá revocación/versionado antes de exponer edición en la nube. La recepción local confirma solo la entrada en la MariaDB intermedia; la aplicación a PostgreSQL, PDF y correo siguen pendientes de integración.

## Desarrollo y pruebas

`npm run dev:server` inicia la API en `8101`; `npm run dev` inicia React en `5174` con proxy para `/api` y `/assets`. Configure `OTC_SITE_ORIGIN` según el origen que use el navegador. `npm test` ejecuta pruebas de token, expiración, firmante tercero, PNG y transacción/idempotencia; `npm run build` compila la interfaz.

No se incluyen credenciales, datos clínicos ni una OTC real. La publicación de código en GitHub **no equivale a desplegarlo en el hosting**.
