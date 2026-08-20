import {useEffect,useState} from 'react';

// Recharts écrit ses couleurs dans des attributs SVG (stroke, fill), et var()
// ne s'y résout pas : une couleur de graphique ne peut donc pas être déclarée
// en CSS puis héritée. On lit les jetons calculés sur :root et on les repasse
// en valeurs littérales, en se réabonnant au basculement de thème pour que les
// graphiques suivent sans rechargement.

export type ChartTheme={
  grid:string;axis:string;ink:string;
  success:string;warning:string;danger:string;accent:string;
  series:string[];ramp:string[];ageing:string[];surface:string;
};

const token=(style:CSSStyleDeclaration,name:string,fallback:string)=>style.getPropertyValue(name).trim()||fallback;

function read():ChartTheme{
  const style=getComputedStyle(document.documentElement);
  const pick=(name:string,fallback:string)=>token(style,name,fallback);
  return{
    grid:pick('--chart-grid','#ececef'),
    axis:pick('--chart-axis','#8b9097'),
    ink:pick('--chart-ink','#252930'),
    success:pick('--ok','#219668'),
    warning:pick('--warn','#8c5c08'),
    danger:pick('--bad','#a33c3c'),
    accent:pick('--accent','#0755d8'),
    surface:pick('--active','#f0f0f2'),
    series:[1,2,3,4,5,6].map((n,i)=>pick(`--chart-${n}`,['#0755d8','#219668','#c0603f','#8c5c08','#5890b9','#a33c3c'][i])),
    ramp:[1,2,3,4,5].map((n,i)=>pick(`--chart-ramp-${n}`,['#262a31','#5b6068','#888d95','#b4b8be','#d9dbdf'][i])),
    ageing:[1,2,3,4].map((n,i)=>pick(`--chart-age-${n}`,['#f3c969','#e9a33c','#db762f','#c84343'][i])),
  };
}

export function useChartTheme():ChartTheme{
  const[theme,setTheme]=useState<ChartTheme>(read);
  useEffect(()=>{
    const update=()=>setTheme(read());
    const observer=new MutationObserver(update);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>observer.disconnect();
  },[]);
  return theme;
}
