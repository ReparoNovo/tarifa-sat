# Tarifa SAT · Reparo Novo

App interna (PWA) de la tienda: tarifa de reparaciones, fundas, reservas, tareas, notas y garantías.

- Página estática en GitHub Pages. Los datos de la tarifa van cifrados en `data.enc`; solo se abren con una cuenta permitida.
- Lo que se apunta (fundas, tareas…) se guarda en Supabase y se sincroniza al momento entre todos los dispositivos.
- `tools/to_pages.py` genera `index.html` y `data.enc` a partir de la página de la tarifa que se actualiza cada mañana.
