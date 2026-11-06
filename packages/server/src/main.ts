import Fastify from 'fastify';

const app = Fastify({ logger: true });
app.get('/healthz', () => ({ ok: true }));
void app.listen({ port: Number(process.env['PORT'] ?? 8080), host: '0.0.0.0' });
