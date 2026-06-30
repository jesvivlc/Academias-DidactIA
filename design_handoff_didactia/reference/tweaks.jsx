/* Tweaks for DidactIA prototype */
function DidactIATweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="DidactIA · Tweaks">
      <TweakSection label="Tema">
        <TweakRadio
          label="Paleta"
          value={tweaks.theme}
          onChange={(v) => setTweak("theme", v)}
          options={[
            { label: "Cálido", value: "warm" },
            { label: "Frío", value: "cool" },
            { label: "Mono", value: "mono" },
          ]}
        />
      </TweakSection>
      <TweakSection label="Layout">
        <TweakRadio
          label="Densidad"
          value={tweaks.density}
          onChange={(v) => setTweak("density", v)}
          options={[
            { label: "Compacta", value: "compact" },
            { label: "Cómoda", value: "comfortable" },
          ]}
        />
        <TweakRadio
          label="Barra lateral"
          value={tweaks.sidebar}
          onChange={(v) => setTweak("sidebar", v)}
          options={[
            { label: "Expandida", value: "expanded" },
            { label: "Iconos", value: "collapsed" },
          ]}
        />
      </TweakSection>
      <TweakSection label="Asistente IA">
        <TweakRadio
          label="Posición"
          value={tweaks.aiDock}
          onChange={(v) => setTweak("aiDock", v)}
          options={[
            { label: "Lateral", value: "rail" },
            { label: "Flotante", value: "fab" },
            { label: "Oculto", value: "hidden" },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}
window.DidactIATweaks = DidactIATweaks;
