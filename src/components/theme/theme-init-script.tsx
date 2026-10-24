import { dashboardThemePathPattern } from "./theme-state";

export function getThemeInitScript() {
  return `(()=>{const r=document.documentElement;let v=null;try{v=localStorage.getItem("klay-theme-preference")}catch{}const s=v==="system"||v==="dark"||v==="light",p=s?v:"system",d=new RegExp(${JSON.stringify(dashboardThemePathPattern)}).test(location.pathname)?(p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p):"light";r.dataset.theme=d;r.dataset.themePreference=p;r.dataset.themePreferenceSource=s?"stored":"default"})()`;
}

export function ThemeInitScript() {
  const script = getThemeInitScript();
  return (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
