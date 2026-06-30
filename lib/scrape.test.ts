import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPoolPage, parsePoolPage } from "./scrape";

describe("parsePoolPage", () => {
  it("lit les horaires d'un bloc « texte encadré » hors accordéon (piscines d'été)", () => {
    // Structure réelle de la page Alfred Nakache été
    const html = `
      <html><body>
        <div class="paragraph paragraph--type--texte-encadre">
          <div class="field field--name-field-texte-encadre">
            <h3>Horaires à partir du 5 juin 2026</h3>
            <p><strong>Fermeture des caisses 1h avant l'heure de fermeture de la piscine.</strong><br>
            <strong>Évacuation du bassin et des plages 30 minutes avant l'heure de fermeture.</strong></p>
            <h4>Du 5 juin au 5 juillet</h4>
            <ul><li>Du lundi au vendredi de 12h à 19h</li><li>Samedi et dimanche de 9h30 à 20h30</li></ul>
            <h4>Du 6 juillet au 23 août</h4>
            <ul><li>De 10h à 20h30</li></ul>
          </div>
        </div>
        <div class="paragraph paragraph--type--texte-encadre">
          <p>Lors d'événements au Stadium, l'accès est modifié.</p>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);

    expect(result.sections).toHaveLength(1);
    const section = result.sections[0];
    expect(section.title).toBe("Horaires à partir du 5 juin 2026");
    // Le titre h3 ne doit pas réapparaître dans les lignes
    expect(section.lines.some((l) => /Horaires à partir/.test(l.text))).toBe(false);
    expect(section.lines).toContainEqual({ kind: "heading", text: "Du 5 juin au 5 juillet" });
    expect(section.lines).toContainEqual({
      kind: "text",
      text: "Du lundi au vendredi de 12h à 19h",
    });
    // Le bloc sans titre d'horaires reste un encart
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatch(/Stadium/);
  });

  it("lit les tableaux (tarifs) ligne par ligne, cellules séparées par « · »", () => {
    const html = `
      <html><body>
        <div class="accordion-item">
          <button class="accordion-button"><span class="accordion-button__text">Horaires et tarifs</span></button>
          <div class="accordion-body">
            <table>
              <tr><th>Tarifs</th><th>Toulousains</th><th>Non Toulousains</th></tr>
              <tr><td><p>Entrée tarif normal</p></td><td>3.40 €</td><td>4.40 €</td></tr>
            </table>
          </div>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);
    expect(result.sections[0].lines).toEqual([
      { kind: "text", text: "Tarifs · Toulousains · Non Toulousains" },
      { kind: "text", text: "Entrée tarif normal · 3.40 € · 4.40 €" },
    ]);
  });

  it("lit le bloc « En bref » et les extensions d'horaires par piscine", () => {
    // Structure réelle du bloc actualités (canicule du 18/06/2026)
    const html = `
      <html><body>
        <div class="block__shorts">
          <h2>En bref</h2>
          <ul class="block__shorts__list">
            <li class="block__shorts__list-item paragraph">
              <div class="title">
                <time datetime="2026-06-18">18/06/2026</time> - <h3>Canicule : mesures exceptionnelles</h3>
              </div>
              <div class="text-formatted">
                <p>Mesures exceptionnelles à compter du vendredi 19 juin :</p>
                <div><ul>
                  <li>Tarif unique : 1 €</li>
                  <li>Extension des horaires :<br>
                    <a href="https://metropole.toulouse.fr/annuaire/piscine-chapou-ete">Piscine Chapou</a> : ouverture jusqu'à 20h<br>
                    <a href="https://metropole.toulouse.fr/annuaire/piscine-alfred-nakache-ete">Piscine Nakache été</a> : ouverture jusqu'à 20h30</li>
                </ul></div>
              </div>
            </li>
          </ul>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);
    expect(result.shorts).toHaveLength(1);
    const s = result.shorts[0];
    expect(s.date).toBe("2026-06-18");
    expect(s.title).toBe("Canicule : mesures exceptionnelles");
    expect(s.text).toMatch(/à compter du vendredi 19 juin/);
    // Les blocs (p / li / <br>) sont séparés par des sauts de ligne, pas collés
    expect(s.text).toMatch(/19 juin :\nTarif unique/);
    expect(s.text).not.toMatch(/juin :Tarif/);
    expect(s.text).toMatch(/20h\nPiscine Nakache été/);
    expect(s.pools).toContainEqual({
      slug: "piscine-chapou-ete",
      after: ": ouverture jusqu'à 20h",
    });
    expect(s.pools.find((p) => p.slug === "piscine-alfred-nakache-ete")?.after).toMatch(/20h30/);
  });

  it("sépare les jours collés par des <br> dans un même paragraphe", () => {
    const html = `
      <html><body>
        <div class="accordion-item">
          <button class="accordion-button"><span class="accordion-button__text">Horaires en période scolaire</span></button>
          <div class="accordion-body">
            <p>Lundi : 12h - 14h<br>Mardi : fermé<br>Jeudi : 16h - 19h</p>
          </div>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);
    expect(result.sections[0].lines).toEqual([
      { kind: "text", text: "Lundi : 12h - 14h" },
      { kind: "text", text: "Mardi : fermé" },
      { kind: "text", text: "Jeudi : 16h - 19h" },
    ]);
  });
});

describe("fetchPoolPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  const mockFetch = (status: number, body: string) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));

  it("lève sur la page de maintenance (HTTP 200 sans aucune section d'horaires)", async () => {
    // La mairie sert sa maintenance avec un 200 et aucune grille : sans ce
    // garde-fou, le rapport écraserait le dernier bon cache par du vide.
    mockFetch(
      200,
      `<html><head><title>Toulouse Mairie Métropole, site officiel.</title></head>
        <body><h1>Site en maintenance</h1><p>Le site sera de nouveau disponible.</p></body></html>`
    );
    await expect(fetchPoolPage("https://x/piscine")).rejects.toThrow(/maintenance/i);
  });

  it("renvoie la page quand elle porte au moins une section d'horaires", async () => {
    mockFetch(
      200,
      `<html><body>
        <div class="accordion-item">
          <button class="accordion-button"><span class="accordion-button__text">Horaires</span></button>
          <div class="accordion-body"><p>Lundi : 12h - 14h</p></div>
        </div>
      </body></html>`
    );
    const page = await fetchPoolPage("https://x/piscine");
    expect(page.sections).toHaveLength(1);
  });

  it("lève sur une erreur HTTP", async () => {
    mockFetch(503, "Service Unavailable");
    await expect(fetchPoolPage("https://x/piscine")).rejects.toThrow(/HTTP 503/);
  });
});
