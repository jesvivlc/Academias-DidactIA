import csv
import re
import sys
import os
from supabase import create_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
SUPABASE_URL = "https://rflfsbrdmgaidhvbuvwb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbGZzYnJkbWdhaWRodmJ1dndiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE5MDE0OCwiZXhwIjoyMDg3NzY2MTQ4fQ.OHKwIXQK59zJTIzULkCWcMaW9w37t3Uwa8tvswPw23w"
CENTRO_ID    = "ad0168e8-6c24-4597-8917-ee54cac8234b"
CSV_PATH     = r"C:\Users\Bruno\Desktop\DidactIA\scripts\A Horarios profes TODOS 25-26(Hoja1).csv"
# ──────────────────────────────────────────────────────────────────────────────

TRAMOS = {
    "7:55":  (0, "07:55", "08:50"),
    "8:50":  (1, "08:50", "09:45"),
    "9:45":  (2, "09:45", "10:40"),
    "10:40": (3, "10:40", "11:35"),
    "12:00": (4, "12:00", "12:55"),
    "12:55": (5, "12:55", "13:50"),
    "13:50": (6, "13:50", "14:45"),
    "15:10": (7, "15:10", "16:05"),
    "16:05": (8, "16:05", "17:00"),
}

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"]
IGNORAR = {"patio", "comida", "claustro"}
# BA[AB] cubre notación Agora: 1BAA/1BAB/2BAA/2BAB (Bachillerato A/B)
# BI cubre variante de IB usada en algunas celdas (1BI, 2BI)
GRUPO_RE = re.compile(
    r'\b([1-4](?:ESO|BAC|BA[AB]|IB|BI|FPB?|CF[A-Z]*)[\s]?[A-D]?)\b',
    re.IGNORECASE
)


def extraer_grupo(actividad):
    m = GRUPO_RE.search(actividad)
    return m.group(1).strip().upper() if m else None


def parse_hora(hora_str):
    hora_str = hora_str.strip()
    for key, info in TRAMOS.items():
        if hora_str.startswith(key):
            return info
    return None


def es_vacia(line):
    return line.strip().strip(",").strip() == ""


def leer_csv(path):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with open(path, encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def parse_bloques(path):
    content = leer_csv(path)
    bloques, bloque = [], []
    for line in content.splitlines():
        if es_vacia(line):
            if bloque:
                bloques.append(bloque)
                bloque = []
        else:
            bloque.append(line)
    if bloque:
        bloques.append(bloque)
    return bloques


def procesar_bloque(bloque):
    if len(bloque) < 3:
        return None, []

    try:
        primera_fila = next(csv.reader([bloque[0]]))
        nombre = primera_fila[0].strip().strip('"').strip("'").strip()
    except (StopIteration, IndexError):
        nombre = bloque[0].strip().strip('"').strip("'").strip()
    registros = []

    for row_line in bloque[2:]:
        try:
            partes = next(csv.reader([row_line]))
        except StopIteration:
            continue
        if not partes:
            continue

        hora_str = partes[0].strip()
        if any(ig in hora_str.lower() for ig in IGNORAR):
            continue

        tramo_info = parse_hora(hora_str)
        if tramo_info is None:
            continue

        tramo_num, hora_inicio, hora_fin = tramo_info

        for col_idx, dia in enumerate(DIAS, start=1):
            if col_idx >= len(partes):
                continue
            actividad = partes[col_idx].strip()
            if not actividad or any(ig in actividad.lower() for ig in IGNORAR):
                continue

            grupo_raw = extraer_grupo(actividad) or ""
            registros.append({
                "centro_id":        CENTRO_ID,
                "profesor_nombre":  nombre,
                "dia":              dia,
                "hora_inicio":      hora_inicio + ":00",
                "hora_fin":         hora_fin + ":00",
                "tramo":            tramo_num,
                "actividad_nombre": actividad,
                "grupo_horario":    grupo_raw.replace(" ", "").upper(),
            })

    return nombre, registros


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: CSV no encontrado en:\n  {CSV_PATH}")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"Parseando {CSV_PATH} ...")
    bloques = parse_bloques(CSV_PATH)
    print(f"  Bloques encontrados: {len(bloques)}")

    datos = {}
    for bloque in bloques:
        nombre, registros = procesar_bloque(bloque)
        if nombre and registros:
            datos[nombre] = registros
        elif nombre:
            print(f"  AVISO: {nombre} -> sin registros validos")

    if not datos:
        print("No se encontraron datos validos.")
        sys.exit(0)

    print(f"\nProfesores a importar: {len(datos)}")

    print("Eliminando registros existentes ...")
    sb.table("horarios_grupo").delete() \
        .eq("centro_id", CENTRO_ID) \
        .in_("profesor_nombre", list(datos.keys())) \
        .execute()

    print("Insertando ...")
    total = 0
    for nombre, registros in datos.items():
        for i in range(0, len(registros), 500):
            sb.table("horarios_grupo").insert(registros[i:i+500]).execute()
        print(f"  {nombre}: {len(registros)}")
        total += len(registros)

    print(f"\nImportacion completada: {total} registros para {len(datos)} profesores.")


if __name__ == "__main__":
    main()
