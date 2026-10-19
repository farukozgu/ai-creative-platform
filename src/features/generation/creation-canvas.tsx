import Image from "next/image";
import { useTranslations } from "next-intl";
import styles from "./creation-canvas.module.css";

const stages = ["upload", "direction", "create"] as const;
const stageImages = {
  upload: "/create/how-it-works-shirt-source.webp",
  direction: "/create/how-it-works-shirt-source.webp",
  create: "/create/how-it-works-shirt-campaign.webp",
} as const;

export function CreationCanvas() {
  const t = useTranslations("Dashboard.creationCanvas");

  return (
    <div className={styles.presentation}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p>{t("eyebrow")}</p>
          <h2>{t("heading")}</h2>
          <span>{t("exampleNotice")}</span>
        </header>
        <ol className={styles.stages}>
          {stages.map((stage, index) => (
            <li className={styles.stage} key={stage}>
              <figure className={styles.media}>
                <Image
                  src={stageImages[stage]}
                  alt={t(`${stage}.alt`)}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1199px) 33vw, 25vw"
                />
                {stage === "direction" ? (
                  <div className={styles.configuration}>
                    <strong>{t("direction.panelTitle")}</strong>
                    <dl>
                      {(["style", "environment", "lighting", "aspectRatio"] as const).map((setting) => (
                        <div key={setting}>
                          <dt>{t(`direction.${setting}Label`)}</dt>
                          <dd>{t(`direction.${setting}Value`)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </figure>
              <div className={styles.copy}>
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{t(`${stage}.title`)}</h3>
                  <p>{t(`${stage}.description`)}</p>
                </div>
              </div>
              {index < stages.length - 1 ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
