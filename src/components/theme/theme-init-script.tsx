export function ThemeInitScript() {
  const script = `(()=>{const r=document.documentElement;let v=null;try{v=localStorage.getItem("klay-theme-preference")}catch{}const s=v==="system"||v==="dark"||v==="light",p=s?v:"system",d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;r.dataset.theme=d;r.dataset.themePreference=p;r.dataset.themePreferenceSource=s?"stored":"default"})()`;
  return (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
