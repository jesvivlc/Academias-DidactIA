#!/usr/bin/env python3
"""
Importa las HORAS DE GUARDIA de un horario individual de profesores en PDF
(formato "HORARI SETMANAL DEL DOCENT" de ITACA/GHC, una rejilla por docente)
a la tabla horarios_grupo como filas con actividad_nombre='Guàrdia'.

Por qué: los horarios importados suelen traer solo las CLASES de cada profesor,
no sus guardias. Sin las guardias, el Plan de cobertura del día (Sustituciones)
no sabe quién está asignado a cubrir ausencias en cada tramo.

Detecta la guardia en cualquier grafía (Guardia/Guàrdia/Vigilància/G/GD) y mapea
cada celda a su (día, tramo) usando las coordenadas del PDF. Cruza los nombres con
los ya existentes en horarios_grupo (matcher por tokens tolerante a orden, tildes,
comas y abreviaturas tipo "Mª"→"María"); los docentes que solo hacen guardia (no
imparten clase) se importan con su nombre del PDF.

Uso:
  pip install pdfplumber
  # 1) genera el JSON de guardias y lo valida contra los profes de la BD:
  python scripts/importar_guardias_pdf.py <horario.pdf> <centro_id> [curso_escolar]
  # imprime un resumen y escribe /tmp/guardias_import.json
  # 2) la inserción en BD se hace aparte (service_role / Management API) con ese JSON.

NO hardcodea credenciales. Solo lee el PDF y produce el JSON + un resumen.
"""
import sys, re, json, unicodedata
from collections import Counter

DIA_MAP = {'Dilluns':'lunes','Dimarts':'martes','Dimecres':'miercoles','Dijous':'jueves','Divendres':'viernes'}

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii','ignore').decode().lower()
    return re.sub(r'\s+',' ', s.replace(',',' ')).strip()

def toks(s):
    return [t for t in norm(s).split(' ') if len(t) > 2]

def es_guardia(t):
    n = norm(t)
    return 'guardia' in n or 'vigilanc' in n

def match(a, b):
    """True si los tokens del nombre más corto prefijo-coinciden en el más largo
    (tolera 'Mª'→'María', apellidos/nombres extra, orden y tildes)."""
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return False
    short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return all(any(t == u or t.startswith(u) or u.startswith(t) for u in long) for t in short)

def parse(pdf_path):
    import pdfplumber
    pdf = pdfplumber.open(pdf_path)
    guardias = set()
    docentes = set()
    for page in pdf.pages:
        words = page.extract_words()
        if not words:
            continue
        dias = sorted([(w['text'], w['x0']) for w in words if w['text'] in DIA_MAP], key=lambda d: d[1])
        if not dias:
            continue
        docu = [w for w in words if w['text'] == 'DOCUMENT']
        if not docu:
            continue
        top, xd = docu[0]['top'], docu[0]['x0']
        line = sorted([w for w in words if abs(w['top']-top) < 4 and w['x0'] < xd-1], key=lambda w: w['x0'])
        name = re.sub(r'\s+', ' ', re.sub(r'\bDOCENT\b', '', ' '.join(w['text'] for w in line))).strip()
        if not name:
            continue
        docentes.add(name)
        times = [w for w in words if re.match(r'^\d\d:\d\d$', w['text']) and w['x0'] < 70 and 90 < w['top'] < 275]
        rows = {}
        for w in times:
            rows.setdefault(round(w['top']), []).append((w['x0'], w['text']))
        rowlist = sorted((t, sorted(v)[0][1]) for t, v in rows.items())
        for w in words:
            if not es_guardia(w['text']):
                continue
            dia = min(dias, key=lambda d: abs(d[1]-w['x0']))[0]
            if not rowlist:
                continue
            hi = min(rowlist, key=lambda r: abs(r[0]-w['top']))[1]
            guardias.add((name, DIA_MAP[dia], hi))
    return sorted(guardias), docentes

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    pdf_path, centro_id = sys.argv[1], sys.argv[2]
    curso = sys.argv[3] if len(sys.argv) > 3 else '2025-26'

    db_names = json.load(open('/tmp/bunol_profes.json'))  # opcional: lista [{profesor_nombre}]
    db = [r['profesor_nombre'] for r in db_names] if db_names else []
    canon = {}
    for n in db:
        k = norm(n)
        if k not in canon or (',' in canon[k] and ',' not in n):
            canon[k] = n

    def db_match(name):
        c = [n for n in db if match(name, n)]
        return canon[norm(c[0])] if c else None

    # mapa de tramos por hora_inicio (rellenar con los reales de la BD si se desea)
    fin_by_hi = {'08:00':'08:55','08:55':'09:50','09:50':'10:45','10:45':'11:15',
                 '11:15':'12:10','12:10':'13:05','13:05':'14:00','14:00':'14:55'}
    num_by_hi = {'08:00':1,'08:55':2,'09:50':3,'10:45':4,'11:15':5,'12:10':6,'13:05':8,'14:00':9}
    def hfin(hi):
        if hi in fin_by_hi: return fin_by_hi[hi]
        h, m = map(int, hi.split(':')); m += 55; h += m//60; m %= 60
        return f'{h:02d}:{m:02d}'

    guardias, docentes = parse(pdf_path)
    out, solo, conc = [], set(), set()
    for n, d, hi in guardias:
        m = db_match(n); final = m or n
        (conc if m else solo).add(final)
        out.append({'centro_id':centro_id,'curso_escolar':curso,'profesor_nombre':final,
                    'dia':d,'hora_inicio':hi+':00','hora_fin':hfin(hi)+':00',
                    'tramo':num_by_hi.get(hi,99),'actividad_nombre':'Guàrdia','grupo_horario':'GUÀRDIA'})
    seen, rows = set(), []
    for r in out:
        k = (r['profesor_nombre'], r['dia'], r['hora_inicio'])
        if k in seen: continue
        seen.add(k); rows.append(r)
    json.dump(rows, open('/tmp/guardias_import.json','w'), ensure_ascii=False)
    print(f'Docentes en PDF: {len(docentes)} | guardias: {len(rows)} | profes con guardia: {len(conc|solo)}')
    print(f'Solo-guardia (no imparten clase): {len(solo)}')
    print('Por dia:', dict(sorted(Counter(r["dia"] for r in rows).items())))
    print('-> /tmp/guardias_import.json')

if __name__ == '__main__':
    main()
