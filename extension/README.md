# YouTube TV voor Firefox

Firefox-extensie die youtube.com omzet in de TV-interface uit `../DESIGN.md`. Bedoeld voor een NUC aan de
TV, bediend met airmouse, toetsenbord of D-pad. Samen met uBlock Origin geeft dat YouTube zonder
advertenties.

## Hoe het werkt

- **Overlay op youtube.com.** `static/page.css` verbergt YouTube's eigen interface al bij het laden.
  `src/content/` tekent de TV-interface (Preact, in een shadow root) eroverheen, op een canvas van
  1920×1080 dat naar het scherm schaalt.
- **Bridge in de pagina.** `src/bridge/main.ts` draait in de MAIN world van de pagina. Het roept
  YouTube's interne API (InnerTube) aan met je ingelogde sessie: geen API-key, geen quota. Historie,
  abonnementen, playlists en reacties werken dus gewoon.
- **YouTube's eigen speler.** Afspelen gaat via YouTube's eigen router en speler (`#movie_player`), die
  schermvullend onder de overlay komt te staan. Wat je kijkt komt in je echte YouTube-historie,
  inclusief verder kijken waar je was. uBlock blokkeert de advertenties. Als er toch één doorkomt,
  wordt die gedempt en overgeslagen.
- **Kanaalpagina.** Hier kun je je abonneren of afmelden. Afmelden vraagt een tweede druk op Enter,
  zodat het niet per ongeluk gebeurt.
- **Details-paneel in de speler.** Beschrijving en reacties zijn uit te klappen. Antwoorden staan als
  boom onder een reactie, en meer reacties worden bijgeladen zodra je het eind nadert. Alleen lezen,
  niet reageren.
- **Robuuste parsers.** `src/data/parse.ts` zoekt in de hele JSON naar bekende renderers in plaats van
  vaste paden te volgen. Daardoor breekt het niet bij elke kleine wijziging van YouTube. Shorts worden
  eruit gefilterd.

## Bediening

| Toets | Actie |
| --- | --- |
| Pijlen / D-pad | focus verplaatsen; in de speler ← → = 10 s terug/vooruit, ↑ = knoppen bovenin |
| Enter / OK / klik | openen, afspelen, pauzeren |
| Esc, Backspace, browser-Terug, rechtermuisknop | terug |
| S | zoeken |
| Spatie, K, Play/Pause-mediatoets | afspelen/pauzeren |
| J / L, mediatoetsen ⏪ ⏩ | 10 s terug/vooruit |
| C | ondertitels aan/uit |
| In het Details-paneel: ↑ ↓ | door beschrijving en reacties; lange teksten scrollen eerst door voordat de focus verder gaat |
| In het Details-paneel: Enter | beschrijving of reactie helemaal uitklappen of weer inklappen, antwoorden tonen of verbergen |
| Muis bewegen | focus volgt de aanwijzer; de cursor verdwijnt na 3 s |
| Scrollwiel | omhoog/omlaag |
| **Ctrl+Shift+Y** | noodknop: TV-interface uit/aan (gewoon YouTube, bijvoorbeeld voor instellingen) |

## Ontwikkelen

```bash
npm install
npm test            # parser-tests op opgeslagen YouTube-responses (test/fixtures)
npm run typecheck
npm run build       # → dist/
npm start           # Firefox met de extensie, via web-ext
npm run dev         # interface met nep-data op http://localhost:5173 (ingelogd; #loggedout voor uitgelogd)
```

`npm run dev` draait de interface zonder YouTube. `dev/mock-bridge.ts` beantwoordt de API-calls uit
`test/fixtures` en simuleert een speler. Handig om aan het design te werken.

Als YouTube iets verandert en een scherm leeg blijft: sla een nieuwe response op in `test/fixtures`,
schrijf een test die faalt en pas `src/data/parse.ts` aan. Draai daarna altijd `npm run scrub-fixtures`
voordat je commit: opgeslagen responses bevatten je IP-adres en een YouTube bezoekers-ID.

## Installeren op de NUC (Linux Mint, Firefox uit de Mint-repo)

1. **Ondertekenen.** Gewone Firefox installeert alleen ondertekende extensies. Maak op
   [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/) API-sleutels aan en
   onderteken de extensie als *unlisted*. Dat is binnen een paar minuten klaar en de extensie wordt
   niet openbaar:

   ```bash
   WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npm run sign
   ```

   Het script stuurt ook de broncode mee (`artifacts/source.zip`, zie `BUILD.md`), omdat Mozilla dat
   vraagt voor gebundelde code. Het ondertekende bestand komt in `artifacts/`. Hoog bij elke nieuwe
   versie `version` in `static/manifest.json` op.
2. **Bestanden plaatsen.**

   ```bash
   sudo mkdir -p /opt/youtube-tv /etc/firefox/policies
   sudo cp artifacts/*.xpi /opt/youtube-tv/youtube-tv.xpi
   sudo cp nuc/policies.json /etc/firefox/policies/policies.json
   ```

   De policy installeert uBlock Origin en deze extensie automatisch, staat autoplay met geluid toe en
   zet alle eerste-start- en reclameschermen van Firefox uit.
3. **Eenmalig inloggen.** Start Firefox gewoon en log in op youtube.com. Dat kan ook vanuit de
   TV-interface met de knop *Sign in*.
4. **Autostart in kiosk-modus.**

   ```bash
   cp nuc/youtube-tv.desktop ~/.config/autostart/
   ```

   Zet daarnaast in Mint's *Energiebeheer* en *Schermbeveiliging* het uitschakelen van het scherm uit.

## Privacy en gegevens

Het manifest geeft `searchTerms` op bij `data_collection_permissions`. Wat je in het zoekveld typt,
gaat voor de suggesties naar Google's suggestiedienst (`suggestqueries-clients6.youtube.com`), dezelfde
dienst die youtube.com zelf gebruikt. Al het andere gaat alleen naar youtube.com, net als bij gewoon
YouTube. De extensie stuurt niets naar de ontwikkelaar of naar andere partijen.

## Bekende beperkingen

- InnerTube is niet officieel. Als YouTube de opbouw van de data flink verandert, kan een scherm leeg
  blijven tot de parser is bijgewerkt.
- Als YouTube een anti-adblockmelding toont, werk dan de filterlijsten van uBlock Origin bij.
