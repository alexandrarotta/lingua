# Lingua Backend

## Configuración

- `HOST`: host de escucha (default `0.0.0.0`)
- `PORT`: puerto (default `8787`)

## Verificación rápida

```bash
curl -i http://localhost:8787/api/health
curl -i http://$(hostname -I | awk '{print $1}'):8787/api/health
```
