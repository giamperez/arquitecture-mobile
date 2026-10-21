// Funciones puras (sin módulos nativos) de la sincronización offline: se prueban en Node contra un servidor simulado.

// Los identificadores del backend solo admiten [a-zA-Z0-9_-]. El servidor devuelve clientRequestId como
// "<userId>:<id>" y la cola local usa "local_<id>": ambos prefijos se quitan antes de reenviarlo.
export const normalizeClientRequestId = (id: string) => String(id).replace(/^local_/, '').replace(/^\d+:/, '');

// Errores de red/timeout (sin respuesta del servidor) frente a respuestas HTTP rechazadas.
export const isNetworkError = (err: any) => !err || err.status === undefined;

// Respuestas que no se arreglan reintentando (el servidor entendió y rechazó la petición).
export const isPermanentHttpError = (err: any) =>
  typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);

// Identificador estable de cada foto/audio de un registro: no depende de su posición en la lista, así un reintento
// (o que una foto rechazada se descarte) nunca vuelve a subir como nuevo un archivo que el servidor ya tiene.
export const photoRequestId = (clientRequestId: string, uri: string) =>
  `${normalizeClientRequestId(clientRequestId)}_${(uri.split('/').pop() || uri).replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);
