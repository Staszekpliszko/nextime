import { useState, useEffect, useRef, useCallback } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Barlow:wght@300;400;500&display=swap');`;

// ─── Camera presets ───────────────────────────────────────────
const CAM_COLORS = {
  1:  { color:"#E8A020", bg:"#1C1400" },
  2:  { color:"#3BA8D4", bg:"#001018" },
  3:  { color:"#9B5CF6", bg:"#120820" },
  4:  { color:"#E8A020", bg:"#1C1400" },
  5:  { color:"#E84040", bg:"#1C0000" },
  6:  { color:"#E86020", bg:"#1C0A00" },
  7:  { color:"#20C97A", bg:"#001C10" },
  8:  { color:"#CF8060", bg:"#180C08" },
  9:  { color:"#8A9CB0", bg:"#080E18" },
};

// ─── Timeline cues ────────────────────────────────────────────
const initVisionCues = () => [
  { id:"v1",  tcIn:426,   tcOut:727,  cam:1, name:"MCU LEAD",          notes:"Push slow",     channel:"PGM" },
  { id:"v2",  tcIn:727,   tcOut:1022, cam:2, name:"FL BAND",           notes:"Wide",          channel:"PGM" },
  { id:"v3",  tcIn:1022,  tcOut:1320, cam:3, name:"MCU GUITARS",       notes:"",              channel:"PGM" },
  { id:"v4",  tcIn:1320,  tcOut:1562, cam:5, name:"WS",                notes:"Stage wide",    channel:"PGM" },
  { id:"v5",  tcIn:1562,  tcOut:1708, cam:6, name:"WS > FL zoom in",   notes:"Slow zoom",     channel:"PGM" },
  { id:"v6",  tcIn:1708,  tcOut:1840, cam:7, name:"FL LEAD",           notes:"",              channel:"PGM" },
  { id:"v7",  tcIn:1840,  tcOut:1958, cam:4, name:"MCU zoom in",       notes:"Punch in",      channel:"PGM" },
  { id:"v8",  tcIn:1958,  tcOut:2120, cam:9, name:"Pull back",         notes:"",              channel:"PGM" },
  { id:"v9",  tcIn:2120,  tcOut:2300, cam:7, name:"WS L to R",         notes:"Pan right",     channel:"PGM" },
  { id:"v10", tcIn:2300,  tcOut:2880, cam:1, name:"MCU LEAD",          notes:"Hold tight",    channel:"PGM" },
  { id:"v11", tcIn:2880,  tcOut:3276, cam:2, name:"FL LEAD",           notes:"",              channel:"PGM" },
  { id:"v12", tcIn:3276,  tcOut:3354, cam:6, name:"MCU DRUMS zoom in", notes:"Quick cut",     channel:"PGM" },
  { id:"v13", tcIn:3354,  tcOut:3475, cam:4, name:"WS push in",        notes:"Slow push",     channel:"PGM" },
];

const LYRICS_DATA = [
  { tc:430,  text:"Eight is a lucky number" },
  { tc:534,  text:"Yes, it is," },
  { tc:617,  text:"its a lucky number" },
  { tc:727,  text:"Somewhere in the ancient mystic trinity" },
  { tc:820,  text:"you find the loving heart of life" },
  { tc:910,  text:"at one with the universe" },
];

const MARKERS_DATA = [
  { tc:430,  label:"SONG START",   color:"#20C97A" },
  { tc:1200, label:"BRIDGE",       color:"#E8A020" },
  { tc:2400, label:"FINAL CHORUS", color:"#E84040" },
  { tc:3200, label:"OUTRO",        color:"#9B5CF6" },
];

const CUES = [
  { id:1, title:"Opening & Welcome",   sub:"Hard Start",       dur:52000,   color:"#C0392B", hard:true  },
  { id:2, title:"Panel Discussion #1", sub:"Host: [Name]",     dur:1200000, color:null,      hard:false },
  { id:3, title:"Field Interview",     sub:"Field Reporter",   dur:900000,  color:"#8B5E1A", hard:false },
  { id:4, title:"Audience Q&A",        sub:"Questions",        dur:900000,  color:null,      hard:false },
  { id:5, title:"Pre-recorded #1",     sub:"Stinger",          dur:900000,  color:null,      hard:false },
  { id:6, title:"Musical Break",       sub:"Band live",        dur:480000,  color:"#1A4D3A", hard:false },
  { id:7, title:"Show Finale",         sub:"Hard Start 21:00", dur:600000,  color:"#C0392B", hard:true  },
];

const TOTAL_SEC = 3600;
const WAVEFORM = Array.from({length:500},(_,i) =>
  Math.max(0.05, Math.abs(Math.sin(i*0.41)*Math.cos(i*0.17)*0.85 + Math.sin(i*0.73)*0.15))
);

// ─── Helpers ──────────────────────────────────────────────────
const fmtTC = (sec, fr=0) => {
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(fr).padStart(2,'0')}`;
};
const fmtMS = ms => {
  if(ms<0)ms=0;
  const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};
const fmtDur = ms => ms<60000?`${Math.round(ms/1000)}s`:`${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`;

// ─── Sub-components ───────────────────────────────────────────

function CountdownArc({remaining, total, isOver, size=180}) {
  const r=size/2-14, circ=2*Math.PI*r;
  const prog=Math.max(0,Math.min(1,remaining/total));
  const dash=circ*prog;
  const cx=size/2,cy=size/2;
  const angle=(1-prog)*360;
  const rad=(angle-90)*Math.PI/180;
  const dx=cx+r*Math.cos(rad), dy=cy+r*Math.sin(rad);
  const clr=isOver?"#FF3A3A":prog<0.2?"#E8A020":"#00D4AA";
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0D1624" strokeWidth="8"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={clr} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{transition:"stroke-dasharray .25s linear,stroke .5s"}}/>
      {!isOver && prog>0 && <circle cx={dx} cy={dy} r="5" fill={clr}/>}
    </svg>
  );
}

function RunwayBars({progress}) {
  const n=18, lit=Math.floor(progress*n);
  return (
    <div style={{display:"flex",gap:2.5,alignItems:"flex-end",height:22}}>
      {Array.from({length:n}).map((_,i)=>{
        const on=i<lit;
        const h=5+(i/n)*13;
        const c=i<n*.55?"#00D4AA":i<n*.8?"#E8A020":"#FF3A3A";
        return <div key={i} style={{width:5.5,height:h,background:on?c:"#0D1624",borderRadius:1,transition:"background .1s"}}/>;
      })}
    </div>
  );
}

// ─── Edit Popup ───────────────────────────────────────────────
function EditPopup({cue, pos, onClose, onSave}) {
  const [name, setName]       = useState(cue.name);
  const [notes, setNotes]     = useState(cue.notes);
  const [channel, setChannel] = useState(cue.channel);
  const ref = useRef();
  useEffect(()=>{ ref.current?.focus(); },[]);
  useEffect(()=>{
    const esc = e => { if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",esc);
    return ()=>window.removeEventListener("keydown",esc);
  },[onClose]);

  const cam = CAM_COLORS[cue.cam]||CAM_COLORS[1];
  return (
    <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"flex-start",justifyContent:"flex-start"}} onClick={onClose}>
      <div style={{
        position:"absolute", left:Math.min(pos.x,window.innerWidth-300), top:Math.min(pos.y,window.innerHeight-260),
        width:290, background:"#0C1524", border:`1px solid ${cam.color}50`,
        borderRadius:10, padding:16, boxShadow:"0 8px 40px #00000090",
      }} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <div style={{width:24,height:24,borderRadius:4,background:cam.bg,border:`1.5px solid ${cam.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:cam.color,fontFamily:"'JetBrains Mono',monospace"}}>{cue.cam}</div>
          <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:14,color:"#90B0D0",letterSpacing:".04em"}}>Edit Vision Cue</span>
          <span style={{marginLeft:"auto",color:"#2A4060",cursor:"pointer",fontSize:16,lineHeight:1}} onClick={onClose}>×</span>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:9,letterSpacing:".1em",color:"#2A4060",textTransform:"uppercase",marginBottom:4}}>Shot name</div>
          <input ref={ref} value={name} onChange={e=>setName(e.target.value)}
            style={{width:"100%",background:"#060C16",border:"1px solid #1A2A40",borderRadius:5,padding:"6px 10px",color:"#C0D8F0",fontFamily:"'JetBrains Mono',monospace",fontSize:12,outline:"none"}}
            onKeyDown={e=>e.key==="Enter"&&onSave({name,notes,channel})}
          />
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:9,letterSpacing:".1em",color:"#2A4060",textTransform:"uppercase",marginBottom:4}}>Director notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            style={{width:"100%",background:"#060C16",border:"1px solid #1A2A40",borderRadius:5,padding:"6px 10px",color:"#708090",fontFamily:"'Barlow',sans-serif",fontSize:12,resize:"none",outline:"none"}}
          />
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:9,letterSpacing:".1em",color:"#2A4060",textTransform:"uppercase",marginBottom:4}}>Switcher channel</div>
          <div style={{display:"flex",gap:6}}>
            {["PGM","ME1","ME2","AUX1","AUX2"].map(ch=>(
              <button key={ch} onClick={()=>setChannel(ch)} style={{
                flex:1, padding:"4px 0", borderRadius:4, cursor:"pointer",
                background:channel===ch?cam.bg:"#060C16",
                border:`1px solid ${channel===ch?cam.color:"#1A2A40"}`,
                color:channel===ch?cam.color:"#2A4060",
                fontFamily:"'JetBrains Mono',monospace", fontSize:9, fontWeight:700,
              }}>{ch}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave({name,notes,channel})} style={{
            flex:1, padding:"7px 0", borderRadius:5, cursor:"pointer",
            background:cam.bg, border:`1px solid ${cam.color}`, color:cam.color,
            fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13, letterSpacing:".06em",
          }}>Save</button>
          <button onClick={onClose} style={{
            padding:"7px 14px", borderRadius:5, cursor:"pointer",
            background:"transparent", border:"1px solid #1A2840", color:"#3A5060",
            fontFamily:"'Rajdhani',sans-serif", fontSize:13,
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────
const TRACK_DEFS = [
  { key:"vision",  label:"Vision",   h:44 },
  { key:"fx",      label:"FX",       h:24 },
  { key:"lyrics",  label:"Lyrics",   h:22 },
  { key:"markers", label:"Markers",  h:24 },
  { key:"audio",   label:"Audio",    h:34 },
];
const MIN_PPS = 0.2, MAX_PPS = 4.0;

function Timeline({playhead, visionCues, setVisionCues, onEditCue}) {
  const [pps, setPps]             = useState(0.72);
  const [dragging, setDragging]   = useState(null); // {id, type:'move'|'resize', startX, origIn, origOut}
  const scrollRef                 = useRef();
  const minimapRef                = useRef();
  const totalPx                   = TOTAL_SEC * 25 * pps;
  const playPx                    = playhead * pps;

  // auto-scroll to playhead
  useEffect(()=>{
    if(!scrollRef.current) return;
    const w = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, playPx - w*0.35);
  },[playPx]);

  // zoom with scroll wheel
  const onWheel = useCallback(e=>{
    if(!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setPps(p => Math.max(MIN_PPS, Math.min(MAX_PPS, p * (e.deltaY>0?0.85:1.18))));
  },[]);
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    el.addEventListener("wheel", onWheel, {passive:false});
    return ()=>el.removeEventListener("wheel",onWheel);
  },[onWheel]);

  // drag handling
  const onMouseDownBlock = (e, id, type) => {
    e.stopPropagation();
    const cue = visionCues.find(c=>c.id===id);
    setDragging({ id, type, startX:e.clientX, origIn:cue.tcIn, origOut:cue.tcOut });
  };

  useEffect(()=>{
    if(!dragging) return;
    const onMove = e => {
      const dx = e.clientX - dragging.startX;
      const dFrames = Math.round(dx / pps);
      setVisionCues(cues => cues.map(c => {
        if(c.id !== dragging.id) return c;
        if(dragging.type === 'move') {
          const dur = dragging.origOut - dragging.origIn;
          const newIn  = Math.max(0, dragging.origIn + dFrames);
          const newOut = newIn + dur;
          return {...c, tcIn:newIn, tcOut:newOut};
        }
        if(dragging.type === 'resize') {
          const newOut = Math.max(dragging.origIn + 25, dragging.origOut + dFrames);
          return {...c, tcOut:newOut};
        }
        return c;
      }));
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return ()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[dragging, pps, setVisionCues]);

  // minimap drag
  const onMinimapClick = e => {
    if(!minimapRef.current || !scrollRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    scrollRef.current.scrollLeft = ratio * totalPx - scrollRef.current.clientWidth/2;
  };

  // current scrolled position for minimap viewport indicator
  const [scrollX, setScrollX] = useState(0);
  const [viewW, setViewW]     = useState(0);
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    const onScroll = ()=>{ setScrollX(el.scrollLeft); setViewW(el.clientWidth); };
    onScroll();
    el.addEventListener("scroll", onScroll);
    return ()=>el.removeEventListener("scroll",onScroll);
  },[totalPx]);

  const shotIdx = visionCues.reduce((a,c,i)=> playhead>=c.tcIn&&playhead<c.tcOut?i:a, 0);

  const monoFont = "'JetBrains Mono',monospace";
  const rajFont  = "'Rajdhani',sans-serif";

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#040710"}}>

      {/* Zoom indicator */}
      <div style={{position:"absolute",top:4,right:60,zIndex:30,display:"flex",alignItems:"center",gap:6,pointerEvents:"none"}}>
        <span style={{fontFamily:monoFont,fontSize:8,color:"#1A2840"}}>Ctrl+Scroll = zoom</span>
        <span style={{fontFamily:monoFont,fontSize:8,color:"#2A4060"}}>{pps.toFixed(2)}px/f</span>
      </div>

      {/* Track area */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0,position:"relative"}}>

        {/* Track labels */}
        <div style={{width:52,flexShrink:0,background:"#040810",borderRight:"1px solid #0D1520"}}>
          <div style={{height:16,borderBottom:"1px solid #0D1520"}}/>
          {TRACK_DEFS.map(t=>(
            <div key={t.key} style={{height:t.h,borderBottom:"1px solid #0D1520",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>
              <span style={{fontFamily:rajFont,fontSize:8,color:"#1A3050",letterSpacing:".07em",textTransform:"uppercase",textAlign:"center",lineHeight:1.2}}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Scrollable canvas */}
        <div ref={scrollRef} style={{flex:1,overflowX:"auto",overflowY:"hidden",position:"relative",cursor:dragging?"grabbing":"default"}}>
          <div style={{position:"relative",width:totalPx,height:"100%",minWidth:totalPx}}>

            {/* Ruler */}
            <div style={{height:16,borderBottom:"1px solid #0D1520",background:"#040810",position:"relative",overflow:"hidden",flexShrink:0}}>
              {Array.from({length:Math.ceil(TOTAL_SEC/10)+1}).map((_,i)=>{
                const sec=i*10, x=sec*25*pps;
                const major=sec%60===0;
                return (
                  <div key={i} style={{position:"absolute",left:x,top:0,height:"100%"}}>
                    <div style={{position:"absolute",bottom:0,width:.5,height:major?9:4,background:major?"#1E3060":"#0D1820"}}/>
                    {major&&<span style={{position:"absolute",bottom:1,left:2,fontFamily:monoFont,fontSize:7,color:"#1A2840",whiteSpace:"nowrap"}}>
                      {`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
                    </span>}
                  </div>
                );
              })}
            </div>

            {/* Vision track */}
            <div style={{height:TRACK_DEFS[0].h,borderBottom:"1px solid #0D1520",position:"relative",background:"#030609"}}>
              {visionCues.map((cue,i)=>{
                const cam=CAM_COLORS[cue.cam]||CAM_COLORS[1];
                const left=cue.tcIn*pps, width=Math.max((cue.tcOut-cue.tcIn)*pps-2,4);
                const active=i===shotIdx;
                return (
                  <div key={cue.id}
                    style={{
                      position:"absolute",left,width,top:3,height:TRACK_DEFS[0].h-6,
                      background:`${cam.bg}EE`,borderTop:`2px solid ${cam.color}`,borderRadius:3,
                      overflow:"hidden",opacity:active?1:0.65,cursor:"grab",
                      outline:active?`1px solid ${cam.color}50`:"none",
                      transition:"opacity .15s",
                      userSelect:"none",
                    }}
                    onMouseDown={e=>onMouseDownBlock(e,cue.id,'move')}
                    onDoubleClick={e=>onEditCue(cue,{x:e.clientX,y:e.clientY})}
                    title="Double-click to edit · Drag to move"
                  >
                    {width>20&&<div style={{position:"absolute",top:2,left:3,width:14,height:14,borderRadius:2,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:cam.color,fontFamily:monoFont}}>{cue.cam}</div>}
                    {width>55&&<div style={{position:"absolute",top:2,left:20,right:16,fontSize:8.5,color:cam.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"'Barlow',sans-serif"}}>{cue.name}</div>}
                    {cue.notes&&width>80&&<div style={{position:"absolute",bottom:2,left:4,right:4,fontSize:7,color:"#304050",whiteSpace:"nowrap",overflow:"hidden",fontFamily:"'Barlow',sans-serif",fontStyle:"italic"}}>{cue.notes}</div>}
                    {/* Resize handle */}
                    <div
                      style={{position:"absolute",right:0,top:0,bottom:0,width:8,cursor:"ew-resize",opacity:.6}}
                      onMouseDown={e=>{e.stopPropagation();onMouseDownBlock(e,cue.id,'resize');}}
                    >
                      <div style={{position:"absolute",right:2,top:"30%",bottom:"30%",width:2,borderRadius:1,background:cam.color}}/>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FX track — empty placeholder */}
            <div style={{height:TRACK_DEFS[1].h,borderBottom:"1px solid #0D1520",background:"#030508"}}/>

            {/* Lyrics track */}
            <div style={{height:TRACK_DEFS[2].h,borderBottom:"1px solid #0D1520",background:"#030406",position:"relative"}}>
              {LYRICS_DATA.map((l,i)=>(
                <div key={i} style={{position:"absolute",left:l.tc*25*pps+3,top:4,fontSize:8,color:"#2A4860",whiteSpace:"nowrap",fontStyle:"italic",fontFamily:"'Barlow',sans-serif"}}>{l.text}</div>
              ))}
            </div>

            {/* Markers track */}
            <div style={{height:TRACK_DEFS[3].h,borderBottom:"1px solid #0D1520",background:"#030508",position:"relative"}}>
              {MARKERS_DATA.map((m,i)=>(
                <div key={i} style={{position:"absolute",left:m.tc*25*pps,top:0,height:TRACK_DEFS[3].h,width:.5,background:m.color}}>
                  <div style={{position:"absolute",top:0,left:4,height:TRACK_DEFS[3].h-1,background:`${m.color}18`,width:70,pointerEvents:"none"}}/>
                  <span style={{position:"absolute",top:3,left:4,fontSize:7.5,color:m.color,whiteSpace:"nowrap",fontFamily:rajFont,fontWeight:700,letterSpacing:".05em"}}>{m.label}</span>
                </div>
              ))}
            </div>

            {/* Audio waveform */}
            <div style={{height:TRACK_DEFS[4].h,background:"#030406",position:"relative",overflow:"hidden"}}>
              <svg width={totalPx} height={TRACK_DEFS[4].h} style={{position:"absolute",top:0,left:0}}>
                {WAVEFORM.map((v,i)=>{
                  const x=(i/WAVEFORM.length)*totalPx;
                  const h=v*(TRACK_DEFS[4].h-6);
                  const past=x<playPx;
                  return <rect key={i} x={x} y={(TRACK_DEFS[4].h-h)/2} width={totalPx/WAVEFORM.length*.55} height={Math.max(h,1)} fill={past?"#1A7A5A":"#0A1E30"}/>;
                })}
              </svg>
            </div>

            {/* Playhead */}
            <div style={{position:"absolute",left:playPx,top:0,bottom:0,width:1,background:"rgba(0,212,170,.85)",pointerEvents:"none",zIndex:20}}>
              <div style={{width:8,height:8,background:"#00D4AA",marginLeft:-3.5,borderRadius:"50%"}}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mini-map ─────────────────────────────────────────── */}
      <div ref={minimapRef} onClick={onMinimapClick}
        style={{height:20,background:"#020508",borderTop:"1px solid #0D1520",position:"relative",cursor:"pointer",flexShrink:0}}>
        {/* Camera blocks on minimap */}
        {visionCues.map(cue=>{
          const cam=CAM_COLORS[cue.cam]||CAM_COLORS[1];
          return (
            <div key={cue.id} style={{
              position:"absolute",
              left:`${(cue.tcIn/(TOTAL_SEC*25))*100}%`,
              width:`${((cue.tcOut-cue.tcIn)/(TOTAL_SEC*25))*100}%`,
              top:4,height:8,
              background:cam.color,opacity:.4,borderRadius:1,
            }}/>
          );
        })}
        {/* Marker lines */}
        {MARKERS_DATA.map(m=>(
          <div key={m.tc} style={{position:"absolute",left:`${(m.tc/(TOTAL_SEC))*100}%`,top:0,bottom:0,width:.5,background:m.color,opacity:.6}}/>
        ))}
        {/* Playhead on minimap */}
        <div style={{position:"absolute",left:`${(playhead/(TOTAL_SEC*25))*100}%`,top:0,bottom:0,width:1.5,background:"#00D4AA",opacity:.9}}/>
        {/* Viewport indicator */}
        {viewW>0&&totalPx>0&&(
          <div style={{
            position:"absolute",
            left:`${(scrollX/totalPx)*100}%`,
            width:`${(viewW/totalPx)*100}%`,
            top:0,bottom:0,
            background:"rgba(0,212,170,.08)",
            border:"1px solid rgba(0,212,170,.25)",
            borderRadius:1,
            pointerEvents:"none",
          }}/>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function NextTime() {
  const [playing, setPlaying]       = useState(true);
  const [frames, setFrames]         = useState(7800);
  const [fr, setFr]                 = useState(0);
  const [cueIdx, setCueIdx]         = useState(0);
  const [elapsed, setElapsed]       = useState(12400);
  const [tod, setTod]               = useState(new Date());
  const [visionCues, setVisionCues] = useState(initVisionCues);
  const [editTarget, setEditTarget] = useState(null); // {cue, pos}
  const aniRef = useRef(null);
  const lastTs = useRef(null);

  useEffect(()=>{ const id=setInterval(()=>setTod(new Date()),1000); return()=>clearInterval(id); },[]);

  useEffect(()=>{
    if(!playing){ lastTs.current=null; return; }
    const tick=ts=>{
      if(lastTs.current){
        const dt=ts-lastTs.current;
        setFr(f=>{ const nf=f+dt/40; if(nf>=25){setFrames(x=>Math.min(x+1,TOTAL_SEC*25-1));return nf-25;} return nf; });
        setElapsed(e=>e+dt);
      }
      lastTs.current=ts;
      aniRef.current=requestAnimationFrame(tick);
    };
    aniRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(aniRef.current);
  },[playing]);

  const curCue   = CUES[cueIdx];
  const nextCue  = CUES[cueIdx+1]||null;
  const remaining= Math.max(0,curCue.dur-elapsed);
  const progress = Math.min(1,elapsed/curCue.dur);
  const isOver   = elapsed>curCue.dur;
  const overMs   = isOver?elapsed-curCue.dur:0;

  const shotIdx  = visionCues.reduce((a,c,i)=>frames>=c.tcIn&&frames<c.tcOut?i:a, 0);
  const curCam   = CAM_COLORS[visionCues[shotIdx]?.cam]||CAM_COLORS[1];
  const nextCamData = visionCues[shotIdx+1];
  const nextCam  = CAM_COLORS[nextCamData?.cam]||CAM_COLORS[2];
  const curLyric = LYRICS_DATA.reduce((a,l)=>frames/25>=l.tc?l:a,null);
  const timeStr  = tod.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

  const raj = "'Rajdhani',sans-serif";
  const mono= "'JetBrains Mono',monospace";

  return (
    <div style={{fontFamily:"'Barlow',sans-serif",background:"#080C14",color:"#8AAABF",height:"720px",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        ${FONTS}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px;background:#080C14}
        ::-webkit-scrollbar-thumb{background:#1A2438;border-radius:2px}
        .cam-row:hover{background:rgba(255,255,255,.04)!important;cursor:pointer}
        .ctrl-btn{background:#0C1422;border:1px solid #182034;border-radius:5px;color:#4A6A88;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s}
        .ctrl-btn:hover{background:#131E32;border-color:#243858;color:#80A8C8}
        .ctrl-btn:active{transform:scale(.95)}
        .play-btn{background:#082018;border:1px solid #00D4AA;border-radius:50%;width:44px;height:44px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .play-btn:hover{box-shadow:0 0 14px #00D4AA40}
        .play-btn.paused{background:#161E08;border-color:#80B800}
        .next-btn{background:#081828;border:1px solid #2A6AAF;border-radius:6px;padding:0 16px;height:38px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;letter-spacing:.07em;color:#5090D0;display:flex;align-items:center;gap:7px;transition:all .12s}
        .next-btn:hover{border-color:#4A8AC8;color:#90C0F0}
        .cue-row{transition:background .1s;cursor:pointer}
        .cue-row:hover{background:rgba(255,255,255,.025)!important}
        .tb-btn{background:transparent;border:.5px solid #0E1C30;border-radius:3px;padding:2px 7px;color:#1C3050;font-size:8.5px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:600;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
        .tb-btn:hover{border-color:#2A4060;color:#3A6080}
        @keyframes live-pulse{0%,100%{opacity:1;box-shadow:0 0 10px #FF304080}50%{opacity:.5;box-shadow:0 0 4px #FF304030}}
        .live-dot{animation:live-pulse 1.3s ease-in-out infinite}
        input,textarea{outline:none;color-scheme:dark}
        input:focus,textarea:focus{border-color:#00D4AA50!important}
      `}</style>

      {/* ══ HEADER ══════════════════════════════════════════ */}
      <div style={{height:42,background:"#050810",borderBottom:"1px solid #0C1520",display:"flex",alignItems:"center",padding:"0 14px",gap:10,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,background:"#00D4AA",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M2 7.5L7.5 2L13 7.5L7.5 13L2 7.5Z" fill="none" stroke="#050810" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="7.5" cy="7.5" r="2" fill="#050810"/>
            </svg>
          </div>
          <span style={{fontFamily:raj,fontWeight:700,fontSize:18,letterSpacing:".1em",color:"#C8E0F4"}}>NEXT<span style={{color:"#00D4AA"}}>TIME</span></span>
          <span style={{fontFamily:mono,fontSize:8,color:"#1A2A3A",marginLeft:2}}>v1.0</span>
        </div>
        <div style={{width:1,height:20,background:"#0C1828"}}/>
        <span style={{fontFamily:raj,fontSize:13,color:"#3A5870",letterSpacing:".03em"}}>Eight The Luckiest Number</span>
        <div style={{background:"#072014",border:"1px solid #00D4AA60",borderRadius:12,padding:"2px 10px",fontFamily:raj,fontSize:10,fontWeight:700,color:"#00D4AA",letterSpacing:".1em"}}>APPROVED</div>
        <div style={{flex:1}}/>
        <div style={{fontFamily:mono,fontSize:10,color:"#1A3050"}}>{timeStr}</div>
        <div style={{display:"flex",gap:2.5}}>
          {[4,7,10,13].map((h,i)=><div key={i} style={{width:3,height:h,background:i<3?"#00D4AA50":"#0D1828",borderRadius:1}}/>)}
        </div>
      </div>

      {/* ══ MAIN ═════════════════════════════════════════════ */}
      <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

        {/* ── LEFT: Shot List ────────────────────────────── */}
        <div style={{width:262,background:"#060A12",borderRight:"1px solid #0C1520",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"8px 12px",borderBottom:"1px solid #0C1520",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontFamily:raj,fontSize:11,fontWeight:600,color:"#2A4A68",letterSpacing:".1em",textTransform:"uppercase"}}>Vision</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:mono,fontSize:8,color:"#182030"}}>All Cameras</span>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {visionCues.map((cue,i)=>{
              const cam=CAM_COLORS[cue.cam]||CAM_COLORS[1];
              const active=i===shotIdx;
              const isNextShot=i===shotIdx+1;
              return (
                <div key={cue.id} className="cam-row" style={{
                  display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
                  background:active?`${cam.bg}CC`:"transparent",
                  borderLeft:active?`2px solid ${cam.color}`:"2px solid transparent",
                  borderBottom:"1px solid #08101C",
                }}>
                  <span style={{fontFamily:mono,fontSize:8,color:"#182030",minWidth:16,textAlign:"right"}}>{String(i+1).padStart(2,'0')}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:mono,fontSize:8,color:active?"#4A6A8A":"#182030"}}>{fmtTC(Math.floor(cue.tcIn/25))}</div>
                    <div style={{fontFamily:"'Barlow',sans-serif",fontSize:11,color:active?"#A8C8E8":isNextShot?"#3A5068":"#202E3C",marginTop:1,fontWeight:active?500:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cue.name}</div>
                  </div>
                  <div style={{width:20,height:20,borderRadius:3,background:cam.bg,border:`1.5px solid ${cam.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:cam.color,flexShrink:0,fontFamily:mono}}>{cue.cam}</div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"7px 10px",borderTop:"1px solid #0C1520",display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontFamily:raj,fontSize:9,color:"#182030",letterSpacing:".1em",textTransform:"uppercase"}}>Next</span>
            <div style={{width:17,height:17,borderRadius:3,background:nextCam.bg,border:`1px solid ${nextCam.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:nextCam.color,fontFamily:mono}}>{nextCamData?.cam||"-"}</div>
            <span style={{fontFamily:"'Barlow',sans-serif",fontSize:11,color:"#253545"}}>{nextCamData?.name||"—"}</span>
          </div>
        </div>

        {/* ── CENTER: Program monitor ─────────────────────── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

          {/* Monitor */}
          <div style={{flex:1,position:"relative",background:"#040710",display:"flex",minHeight:0}}>
            {/* Giant ghost TC */}
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:1}}>
              <span style={{fontFamily:mono,fontSize:80,fontWeight:700,color:"#090F1E",letterSpacing:"-2px",userSelect:"none"}}>{fmtMS(remaining)}</span>
            </div>

            {/* Arc + stats */}
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",zIndex:2,padding:"16px 0"}}>
              <div style={{position:"relative",marginBottom:10}}>
                <CountdownArc remaining={remaining} total={curCue.dur} isOver={isOver} size={176}/>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontFamily:raj,fontSize:10,fontWeight:600,color:"#283848",letterSpacing:".12em",textTransform:"uppercase",marginBottom:3}}>{isOver?"OVERRUN":"Remaining"}</div>
                  <div style={{fontFamily:mono,fontSize:30,fontWeight:700,color:isOver?"#FF3A3A":"#E0F4FF",letterSpacing:"-1px",lineHeight:1}}>
                    {isOver?`+${fmtMS(overMs)}`:fmtMS(remaining)}
                  </div>
                  <div style={{fontFamily:mono,fontSize:10,color:"#1E2E40",marginTop:3}}>{fmtDur(curCue.dur)}</div>
                </div>
              </div>
              <RunwayBars progress={progress}/>
              {/* Lyric */}
              <div style={{fontFamily:"'Barlow',sans-serif",fontSize:13,color:"#3A5A78",fontStyle:"italic",marginTop:12,minHeight:20,textAlign:"center",padding:"0 16px",maxWidth:240,opacity:curLyric?1:0,transition:"opacity .5s"}}>
                {curLyric?`"${curLyric.text}"`:"."}
              </div>
            </div>

            {/* Right info panel */}
            <div style={{flex:1.3,display:"flex",flexDirection:"column",justifyContent:"center",padding:"16px 22px 16px 0",position:"relative",zIndex:2}}>
              {/* PGM cam */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div className="live-dot" style={{width:9,height:9,borderRadius:"50%",background:"#FF3040",flexShrink:0}}/>
                <span style={{fontFamily:raj,fontSize:9,fontWeight:700,letterSpacing:".14em",color:"#FF3040",textTransform:"uppercase"}}>PGM</span>
                <div style={{marginLeft:"auto",width:34,height:34,borderRadius:6,background:curCam.bg,border:`2px solid ${curCam.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:curCam.color,fontFamily:mono}}>{visionCues[shotIdx]?.cam||1}</div>
                <div>
                  <div style={{fontFamily:raj,fontSize:14,fontWeight:600,color:"#90B8D8"}}>{visionCues[shotIdx]?.name||""}</div>
                  <div style={{fontFamily:mono,fontSize:8,color:"#1E3448"}}>{visionCues[shotIdx]?.channel||"PGM"} · CAM {visionCues[shotIdx]?.cam||1}</div>
                </div>
              </div>

              {/* Cue title */}
              <div style={{marginBottom:12}}>
                <div style={{fontFamily:raj,fontSize:21,fontWeight:700,color:"#C8E0F8",letterSpacing:".02em",lineHeight:1.2}}>{curCue.title}</div>
                <div style={{fontFamily:raj,fontSize:12,color:"#2E4A62",marginTop:3}}>{curCue.sub}</div>
              </div>

              {/* TC display */}
              <div style={{fontFamily:mono,fontSize:13,color:"#1E3858",letterSpacing:"1px",marginBottom:14}}>
                {fmtTC(Math.floor(frames/25),Math.floor(fr))}
              </div>

              {/* Next cue */}
              {nextCue&&(
                <div style={{background:"#080F1C",border:"1px solid #142030",borderRadius:8,padding:"9px 12px"}}>
                  <div style={{fontFamily:raj,fontSize:8,letterSpacing:".12em",color:"#1A3048",textTransform:"uppercase",marginBottom:5}}>Next cue</div>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    {nextCue.color&&<div style={{width:3,height:30,background:nextCue.color,borderRadius:2,flexShrink:0}}/>}
                    <div style={{flex:1}}>
                      <div style={{fontFamily:raj,fontSize:13,fontWeight:600,color:"#506070"}}>{nextCue.title}</div>
                      <div style={{fontFamily:mono,fontSize:9,color:"#1E2E3C",marginTop:2}}>{fmtDur(nextCue.dur)}</div>
                    </div>
                    <div style={{fontFamily:raj,fontSize:10,color:nextCue.hard?"#D0900A":"#1E3048",letterSpacing:".08em",fontWeight:600}}>{nextCue.hard?"⬥ HARD":"SOFT"}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Corner info */}
            <div style={{position:"absolute",top:10,right:14,zIndex:3,textAlign:"right"}}>
              <div style={{fontFamily:mono,fontSize:8,color:"#182030"}}>TOD (CET)</div>
              <div style={{fontFamily:mono,fontSize:12,color:"#2A4A6A"}}>{timeStr}</div>
            </div>
          </div>

          {/* Transport */}
          <div style={{height:52,background:"#040A10",borderTop:"1px solid #0C1520",display:"flex",alignItems:"center",padding:"0 14px",gap:9,flexShrink:0}}>
            <div style={{fontFamily:mono,fontSize:22,fontWeight:700,color:"#BCD8F4",letterSpacing:".5px",minWidth:190}}>{fmtTC(Math.floor(frames/25),Math.floor(fr))}</div>
            <div style={{width:1,height:28,background:"#0C1828"}}/>
            <button className="ctrl-btn" style={{width:32,height:32}} onClick={()=>setFrames(0)}>
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 12 12"><rect x="0" y="1" width="2.5" height="10" rx="1"/><path d="M11 1L3.5 6L11 11V1Z"/></svg>
            </button>
            <button className="ctrl-btn" style={{width:32,height:32}} onClick={()=>setFrames(f=>Math.max(0,f-125))}>
              <svg width="11" height="11" fill="currentColor" viewBox="0 0 11 11"><path d="M10 1L3 5.5L10 10V1Z"/><rect x="0" y="1" width="2" height="9" rx="1"/></svg>
            </button>
            <button className={`play-btn${!playing?" paused":""}`} onClick={()=>setPlaying(p=>!p)}>
              {playing
                ? <svg width="12" height="13" fill="white"><rect x="0" y="0" width="4" height="13" rx="1.5"/><rect x="8" y="0" width="4" height="13" rx="1.5"/></svg>
                : <svg width="11" height="13" fill="white"><path d="M1 1L10.5 6.5L1 12V1Z"/></svg>}
            </button>
            <button className="next-btn" onClick={()=>{if(cueIdx<CUES.length-1){setCueIdx(i=>i+1);setElapsed(0);}}}>
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 12 12"><path d="M1 1L8.5 6L1 11V1Z"/><rect x="10" y="1" width="2.5" height="10" rx="1"/></svg>
              Next cue
            </button>
            <div style={{flex:1}}/>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:raj,fontSize:8,letterSpacing:".1em",color:"#182030",textTransform:"uppercase"}}>Over / Under</div>
              <div style={{fontFamily:mono,fontSize:14,fontWeight:700,color:isOver?"#FF3A3A":"#00D4AA"}}>{isOver?`+${fmtMS(overMs)}`:`-${fmtMS(remaining)}`}</div>
            </div>
            <div style={{background:"#06100A",border:"1px solid #142820",borderRadius:6,padding:"4px 10px",textAlign:"center"}}>
              <div style={{fontFamily:raj,fontSize:8,color:"#1A3020",letterSpacing:".1em",textTransform:"uppercase"}}>Hard start</div>
              <div style={{fontFamily:mono,fontSize:12,fontWeight:600,color:"#D09010"}}>21:00:00</div>
              <div style={{fontFamily:mono,fontSize:9,color:"#18B860"}}>1:58:52</div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Programme cue list ────────────────────── */}
        <div style={{width:296,background:"#060A12",borderLeft:"1px solid #0C1520",display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"8px 12px",borderBottom:"1px solid #0C1520",display:"flex",alignItems:"center"}}>
            <span style={{fontFamily:raj,fontSize:11,fontWeight:600,color:"#2A4A68",letterSpacing:".1em",textTransform:"uppercase"}}>Programme</span>
            <div style={{flex:1}}/>
            <span style={{fontFamily:mono,fontSize:8,color:"#182030"}}>{cueIdx+1}/{CUES.length}</span>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {CUES.map((cue,i)=>{
              const active=i===cueIdx, isNextC=i===cueIdx+1, past=i<cueIdx;
              return (
                <div key={cue.id} className="cue-row" onClick={()=>{setCueIdx(i);setElapsed(0);}} style={{
                  display:"flex",alignItems:"stretch",borderBottom:"1px solid #08101C",
                  background:active?"#080F1E":"transparent",
                  borderLeft:active?"3px solid #00D4AA":cue.color?`3px solid ${cue.color}`:"3px solid transparent",
                  opacity:past?.42:1,position:"relative",overflow:"hidden",
                }}>
                  {active&&<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,#00D4AA07,transparent)",pointerEvents:"none"}}/>}
                  <div style={{padding:"9px 11px",flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <div style={{width:20,height:20,borderRadius:4,flexShrink:0,background:active?"#00D4AA":cue.color||"#0E1828",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontSize:10,fontWeight:700,color:active?"#050A10":"#7A90A8"}}>{i+1}</div>
                      {cue.hard&&<span style={{fontFamily:raj,fontSize:8,color:"#C08010",letterSpacing:".1em",textTransform:"uppercase"}}>HARD</span>}
                      <span style={{fontFamily:raj,fontSize:13,fontWeight:active?600:400,color:active?"#C0DCF4":isNextC?"#4A6078":"#2A3A4A",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cue.title}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontFamily:raj,fontSize:10,color:"#1E2E3C"}}>{cue.sub}</span>
                      <span style={{fontFamily:mono,fontSize:9,color:active?"#304858":"#182030"}}>{fmtDur(cue.dur)}</span>
                    </div>
                    {active&&(
                      <div style={{marginTop:6,height:2,background:"#0C1420",borderRadius:1,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${progress*100}%`,background:isOver?"#FF3A3A":"#00D4AA",transition:"width .5s linear",borderRadius:1}}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ BOTTOM: Timeline ══════════════════════════════════ */}
      <div style={{height:164,background:"#040710",borderTop:"1px solid #0C1520",flexShrink:0,display:"flex",flexDirection:"column",position:"relative"}}>
        <Timeline
          playhead={frames}
          visionCues={visionCues}
          setVisionCues={setVisionCues}
          onEditCue={(cue,pos)=>setEditTarget({cue,pos})}
        />
        {/* Bottom toolbar */}
        <div style={{height:26,background:"#030608",borderTop:"1px solid #0C1520",display:"flex",alignItems:"center",gap:4,padding:"0 10px",flexShrink:0}}>
          {["Shift","Cut","Copy","Paste","Delete","Undo","Edit","Trim","Marker","Home","Next"].map(b=>(
            <button key={b} className="tb-btn">{b}</button>
          ))}
          <div style={{flex:1}}/>
          <span style={{fontFamily:mono,fontSize:8,color:"#1A2838"}}>Ctrl+Scroll = zoom · Drag = move · Drag edge = resize · Dbl-click = edit</span>
          <div style={{width:1,height:16,background:"#0C1828",margin:"0 6px"}}/>
          {[{l:"● REC",c:"#FF3040",bc:"#1A0608"},{l:"⏸ PAUSE",c:"#3A8AD4",bc:"#061018"},{l:"▶ PLAY",c:"#00D4AA",bc:"#061210"}].map(b=>(
            <button key={b.l} style={{background:b.bc,border:`1px solid ${b.c}40`,borderRadius:4,padding:"2px 9px",color:b.c,cursor:"pointer",fontFamily:raj,fontWeight:700,fontSize:9,letterSpacing:".06em"}}>{b.l}</button>
          ))}
        </div>
      </div>

      {/* ══ EDIT POPUP ════════════════════════════════════════ */}
      {editTarget&&(
        <EditPopup
          cue={editTarget.cue}
          pos={editTarget.pos}
          onClose={()=>setEditTarget(null)}
          onSave={({name,notes,channel})=>{
            setVisionCues(cs=>cs.map(c=>c.id===editTarget.cue.id?{...c,name,notes,channel}:c));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
