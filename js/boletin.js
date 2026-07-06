// ── BOLETÍN MENSUAL DE SEGUIMIENTO (PDF con marca + comentario IA) ──
// Genera un informe de evolución por alumno: asistencia del mes, notas recientes,
// comentario de evolución con IA y próximos pasos. jsPDF (CDN en app.html).
// Expuesto como window.generarBoletin(alumnoId, btn) y window.boletinEmail(...).

function _blMes(){ const d=new Date(); return { ini:new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10), label:["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][d.getMonth()]+" "+d.getFullYear() }; }
function _blNombre(a){ return a?([a.nombre,a.apellidos].filter(Boolean).join(" ")||"Alumno"):"Alumno"; }
function _blInk(){
  const v=(getComputedStyle(document.documentElement).getPropertyValue("--ink")||"").trim();
  const m=/^#?([0-9a-f]{6})$/i.exec(v);
  if(m){ const h=m[1]; return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  return [31,44,79];
}

async function _blDatos(alumnoId){
  const { ini } = _blMes();
  const d90=new Date(Date.now()-90*864e5).toISOString().slice(0,10);
  const [al, mg, asis, cal] = await Promise.all([
    sb.from("alumnos").select("id,nombre,apellidos,nivel_educativo,centro_escolar").eq("id",alumnoId).single(),
    sb.from("matricula_grupo").select("grupos(nombre,asignatura)").eq("centro_id",ctrId).in("matricula_id",
      (await sb.from("matriculas").select("id").eq("alumno_id",alumnoId).eq("centro_id",ctrId)).data?.map(m=>m.id)||["00000000-0000-0000-0000-000000000000"]),
    sb.from("asistencia").select("estado,fecha").eq("centro_id",ctrId).eq("alumno_id",alumnoId).gte("fecha",ini),
    sb.from("calificaciones").select("nota,evaluacion,fecha,grupos(asignatura,nombre)").eq("centro_id",ctrId).eq("alumno_id",alumnoId).gte("fecha",d90).order("fecha",{ascending:false}),
  ]);
  const asisArr=asis.data||[];
  const cont={presente:0,ausente:0,retraso:0,justificada:0}; asisArr.forEach(r=>{ if(cont[r.estado]!=null)cont[r.estado]++; });
  const tot=asisArr.length; const ok=cont.presente+cont.retraso;
  const pct=tot?Math.round(ok/tot*100):null;
  const notas=(cal.data||[]).slice(0,12);
  const media=notas.length?(notas.reduce((s,n)=>s+Number(n.nota||0),0)/notas.length):null;
  return { alumno:al.data, grupos:(mg.data||[]).map(x=>x.grupos).filter(Boolean), cont, tot, pct, notas, media };
}

async function _blComentarioIA(d){
  const nombre=_blNombre(d.alumno);
  const resumen=[
    d.pct!=null?("asistencia "+d.pct+"% este mes"):null,
    d.media!=null?("nota media reciente "+d.media.toFixed(1)):null,
    d.grupos.length?("asignaturas: "+d.grupos.map(g=>g.asignatura||g.nombre).join(", ")):null,
  ].filter(Boolean).join("; ");
  const sys="Eres tutor/a de "+(ctrName||"una academia de repaso de ESO")+". Escribes un comentario de evolución para la familia, en español, cercano y honesto, destacando avances y áreas de mejora, terminando con 1-2 recomendaciones. 60-90 palabras. Sin encabezados ni saludos.";
  try{ const t=await iaChat(sys,"Alumno/a "+nombre+" ("+(d.alumno?.nivel_educativo||"ESO")+"). Datos: "+(resumen||"sin datos suficientes")+". Redacta el comentario de evolución del mes."); if(t) return t.trim(); }catch(e){}
  // fallback determinista
  const a=[]; if(d.pct!=null) a.push(d.pct>=85?"La asistencia ha sido muy buena este mes.":d.pct>=70?"La asistencia es correcta, con margen de mejora.":"Conviene mejorar la asistencia a las sesiones.");
  if(d.media!=null) a.push(d.media>=7?"El rendimiento es sólido.":d.media>=5?"El rendimiento es adecuado; seguimos reforzando.":"Recomendamos reforzar los contenidos base.");
  a.push("Seguimos trabajando en su progreso; cualquier duda, estamos a su disposición.");
  return a.join(" ");
}

async function generarBoletin(alumnoId, btn){
  const orig=btn?btn.textContent:""; if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
  try{
    if(!window.jspdf||!window.jspdf.jsPDF){ showToastGlobal("No se pudo cargar el generador PDF","error"); return; }
    const d=await _blDatos(alumnoId);
    const comentario=await _blComentarioIA(d);
    const { label }=_blMes();
    const doc=new window.jspdf.jsPDF(); const ink=_blInk(); const W=210;
    // Cabecera con marca
    doc.setFillColor(ink[0],ink[1],ink[2]); doc.rect(0,0,W,32,"F");
    doc.setTextColor(255); doc.setFontSize(17); doc.setFont("helvetica","bold");
    doc.text(String(ctrName||"Academia"),16,15);
    doc.setFontSize(11); doc.setFont("helvetica","normal");
    doc.text("Boletín de seguimiento · "+label,16,24);
    doc.setTextColor(30,30,30);
    // Alumno
    let y=44; doc.setFontSize(15); doc.setFont("helvetica","bold"); doc.text(_blNombre(d.alumno),16,y);
    doc.setFontSize(10.5); doc.setFont("helvetica","normal"); doc.setTextColor(110);
    y+=7; doc.text([d.alumno?.nivel_educativo,d.alumno?.centro_escolar].filter(Boolean).join(" · ")||"—",16,y);
    if(d.grupos.length){ y+=6; doc.text("Grupos: "+d.grupos.map(g=>g.nombre||g.asignatura).join(", "),16,y); }
    doc.setTextColor(30,30,30);
    // Asistencia
    y+=14; doc.setFontSize(12.5); doc.setFont("helvetica","bold"); doc.text("Asistencia del mes",16,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); y+=8;
    const asisLine=d.tot?`Sesiones: ${d.tot}   ·   Asistencia: ${d.pct}%   ·   Faltas: ${d.cont.ausente}   ·   Retrasos: ${d.cont.retraso}`:"Sin registros de asistencia este mes.";
    doc.text(asisLine,16,y);
    // barra
    if(d.tot){ y+=6; const bw=178; doc.setFillColor(230,227,220); doc.roundedRect(16,y,bw,5,2,2,"F");
      const c=d.pct>=85?[63,147,103]:d.pct>=70?[214,149,64]:[194,77,47];
      doc.setFillColor(c[0],c[1],c[2]); doc.roundedRect(16,y,Math.max(3,bw*d.pct/100),5,2,2,"F"); }
    // Notas
    y+=16; doc.setFontSize(12.5); doc.setFont("helvetica","bold"); doc.text("Calificaciones recientes",16,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); y+=8;
    if(d.notas.length){
      doc.setTextColor(120); doc.text("Asignatura",16,y); doc.text("Prueba",96,y); doc.text("Fecha",150,y); doc.text("Nota",186,y,{align:"right"}); doc.setTextColor(30,30,30);
      y+=3; doc.setDrawColor(220); doc.line(16,y,194,y); y+=6;
      d.notas.forEach(n=>{ if(y>270){ doc.addPage(); y=20; }
        doc.text(String((n.grupos?.asignatura||n.grupos?.nombre||"—")).slice(0,42),16,y);
        doc.text(String(n.evaluacion||"—").slice(0,26),96,y);
        doc.text(String(n.fecha||"").slice(0,10),150,y);
        const nota=Number(n.nota); const nc=nota>=5?[40,120,60]:[194,77,47]; doc.setTextColor(nc[0],nc[1],nc[2]);
        doc.setFont("helvetica","bold"); doc.text(nota.toFixed(1),186,y,{align:"right"}); doc.setFont("helvetica","normal"); doc.setTextColor(30,30,30);
        y+=7; });
      if(d.media!=null){ y+=1; doc.setFont("helvetica","bold"); doc.text("Media",16,y); doc.text(d.media.toFixed(1),186,y,{align:"right"}); doc.setFont("helvetica","normal"); }
    } else { doc.setTextColor(120); doc.text("Sin calificaciones registradas en los últimos meses.",16,y); doc.setTextColor(30,30,30); }
    // Comentario IA
    y+=16; if(y>250){ doc.addPage(); y=20; }
    doc.setFontSize(12.5); doc.setFont("helvetica","bold"); doc.text("Comentario de evolución",16,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10.5); y+=8;
    const lines=doc.splitTextToSize(comentario,178); lines.forEach(l=>{ if(y>278){ doc.addPage(); y=20; } doc.text(l,16,y); y+=6; });
    // Pie
    doc.setFontSize(8.5); doc.setTextColor(150);
    doc.text("Documento generado automáticamente por "+String(ctrName||"la academia")+" · DidactIA Academias",16,290);
    doc.save("boletin-"+_blNombre(d.alumno).replace(/\s+/g,"_")+"-"+label.replace(/\s+/g,"_")+".pdf");
    showToastGlobal("Boletín generado","success");
  }catch(e){ showToastGlobal("Error: "+(e.message||e),"error"); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=orig; } }
}

window.generarBoletin=generarBoletin;
