// Liveness do servidor web, usado pelo healthcheck do container.
export function GET(): Response {
  return Response.json({ status: 'ok' });
}
