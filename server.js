require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let requestCount = 0;

app.use((req, res, next) => {
    requestCount++;
    console.log("Requests:", requestCount, "| Path:", req.path);
    next();
});

const API_KEY = process.env.GEMINI_API_KEY;

app.post("/analyze", async (req, res) => {
    const { parts } = req.body;

    if (!parts || Object.keys(parts).length === 0) {
        return res.status(400).json({ error: "Nav datu analīzei" });
    }

    try {

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `
Tu esi stingrs, bet taisnīgs komisijas loceklis.

Tev ir vairākas prezentācijas daļas. Novērtē KATRU atsevišķi.

SVARĪGI:
Teksts var būt iegūts no balss atpazīšanas, tāpēc:
- var nebūt pieturzīmes
- var būt gramatikas kļūdas
- var būt nepareizi atpazīti vārdi

PIRMS vērtēšanas:
mentāli "sakārto" tekstu:
- izlabo gramatiku
- pievieno pieturzīmes
- interpretē domu, NEVIS sodi par formu

NOTEIKUMI:
- Ja tekstā IR doma → vērtē saturu, pat ja forma ir slikta
- Ja teksts tiešām ir bezjēdzīgs → score = 0
- NESODI par pareizrakstību vai pieturzīmēm
- SODI tikai par:
  - loģikas trūkumu
  - argumentācijas trūkumu
  - tukšu saturu ("ūdeni")

NOVĒRTĒ:
1. Skaidrību (vai doma ir saprotama)
2. Loģiku (vai ir secība)
3. Argumentāciju (vai ir pamatojums)
4. "Ūdens" daudzumu

ATBILDES FORMĀTS (TIKAI JSON, BEZ PAPILDUS TEKSTA):
{
  "parts": {
    "Ievads": {
      "score": 0-10,
      "fillerLevel": "zems|vidējs|augsts",
      "feedback": [
        "konkrēts ieteikums",
        "konkrēts ieteikums"
      ]
    }
  }
}

DATI:
${JSON.stringify(parts)}
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API ERROR FULL:", JSON.stringify(errorData, null, 2));

            return res.json({
                parts: {},
                totalScore: 0,
                summary: "API kļūda (limits vai serveris)"
            });
        }

        const data = await response.json();

        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        let parsed;

        try {

            const cleanedText = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            parsed = JSON.parse(cleanedText);

        } catch (e) {
            console.error("JSON parse error:", text);

            parsed = { parts: {} };
        }

        let results = parsed.parts || {};
        let totalScore = 0;

        for (let partName in parts) {
            if (!results[partName]) {
                results[partName] = {
                    score: 0,
                    fillerLevel: "-",
                    feedback: ["Nav datu (AI kļūda)"]
                };
            }

            totalScore += results[partName].score || 0;
        }

        const requiredParts = [
            "Ievads",
            "Metodoloģija",
            "Rezultāti",
            "Secinājumi"
        ];

        let missingParts = [];

        requiredParts.forEach(part => {
            if (!parts[part]) {
                totalScore -= 2;
                missingParts.push(part);
            }
        });

        totalScore = Math.max(0, totalScore);
        let summary = "Vidēja prezentācija";

        if (totalScore > Object.keys(parts).length * 8) {
            summary = "Ļoti laba prezentācija";
        } else if (totalScore < Object.keys(parts).length * 5) {
            summary = "Vāja prezentācija";
        }

        if (missingParts.length > 0) {
            summary += `. Trūkst svarīgas daļas: ${missingParts.join(", ")}`;
        }

        res.json({
            parts: results,
            totalScore,
            summary
        });

    } catch (e) {
        console.error(e);

        res.json({
            parts: {},
            totalScore: 0,
            summary: "AI nav pieejams"
        });
    }
});

///////////////////////////////////////////////////////////////////////////////////////////
// argumentacijas uzdevums
app.post("/generate-questions", async (req, res) => {
    const { topic, structure, transcript } = req.body;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, // Используем стабильную 2.0
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `
                            Tu esi bakalaura darba aizstāvēšanas komisija.

                            Studentam ir prezentācija ar šādu tēmu:
                            TĒMA: ${topic}

                            Prezentācijas struktūra:
                            ${structure}

                            Prezentācijas saturs:
                            ${transcript}

                            Izveido 6 DAŽĀDUS jautājumus studentam.

                            SVARĪGI NOTEIKUMI:

                            1. Katram jautājumam jābūt unikālam.
                            Neatkārto līdzīgus jautājumus.

                            2. Izvairies no klišejām un pārāk bieži izmantotiem jautājumiem:
                            - "Kāpēc izvēlējāties šo tēmu?"
                            - "Kas ir mērķauditorija?"
                            - "Kāda ir darba aktualitāte?"
                            - "Kāpēc izvēlējāties šīs tehnoloģijas?"
                            - "Kādi ir sistēmas ierobežojumi?"
                            Ja iespējams, izmanto oriģinālākus formulējumus.

                            3. Katru reizi ģenerē atšķirīgus jautājumus,
                            pat ja tēma atkārtojas.

                            4. EASY jautājumi:
                            - vienkārši;
                            - saistīti ar praktisko pielietojumu;
                            - motivāciju;
                            - projekta ideju;
                            - lietotājiem;
                            - darba nozīmi.

                            5. MEDIUM jautājumi:
                            - par metodoloģiju;
                            - arhitektūru;
                            - datiem;
                            - algoritmiem;
                            - sistēmas darbību;
                            - eksperimentiem;
                            - testēšanu;
                            - rezultātu interpretāciju.

                            6. HARD jautājumi:
                            - kritiski;
                            - analītiski;
                            - salīdzinoši;
                            - par drošību;
                            - veiktspēju;
                            - mērogojamību;
                            - alternatīviem risinājumiem;
                            - ierobežojumiem;
                            - iespējamām kļūdām;
                            - zinātnisko pamatojumu.

                            7. Jautājumiem jāizklausās kā īstai komisijai:
                            - profesionāli;
                            - dabiski;
                            - dažādi pēc stila.

                            8. EASY jautājumiem jābūt īsākiem,
                            sarežģitiem - detalizētākiem.

                            ATBILDI TIKAI TĪRĀ JSON FORMĀTĀ.
                            BEZ markdown.
                            BEZ paskaidrojumiem.

                            FORMĀTS:
                            {
                            "questions": [
                                {"level": "EASY", "text": "..."},
                                {"level": "EASY", "text": "..."},
                                {"level": "MEDIUM", "text": "..."},
                                {"level": "MEDIUM", "text": "..."},
                                {"level": "HARD", "text": "..."},
                                {"level": "HARD", "text": "..."}
                            ]
                            }
                            `
                        }]
                    }]
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            return res.status(response.status).json({
                questions: [],
                error: `API kļūda: ${response.status}`
            });
        }
        // ----------------------------------------------

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : "{}";

        try {
            const parsed = JSON.parse(cleanJson);
            res.json(parsed);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            throw new Error("AI neizveidoja pareizu datu formātu");
        }

    } catch (e) {
        console.error(e);
        res.json({
            questions: [
                {level: "EASY", text: "Kas ir darba mērķis?"},
                {level: "MEDIUM", text: "Kāpēc izvēlēta šī tehnoloģija?"},
                {level: "HARD", text: "Kādi ir sistēmas ierobežojumi?"}
            ]
        });
    }
});

app.post("/analyze-defense", async (req, res) => {

    const { answers } = req.body;

    try {

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `
Tu esi bakalaura darba komisija.

Novērtē KATRU studenta atbildi.

SVARĪGI:
- nesodi pārāk stingri par gramatiku;
- vērtē saturu un argumentāciju;
- atbildes var būt īsas.

KATRAM jautājumam dod:
- score (0-100)
- 2 īsus ieteikumus

ATBILDI TIKAI JSON FORMĀTĀ.

FORMĀTS:
{
  "results": [
    {
      "question": "...",
      "score": 75,
      "feedback": [
        "...",
        "..."
      ]
    }
  ]
}

DATI:
${JSON.stringify(answers)}
`
                        }]
                    }]
                })
            }
        );

        if (!response.ok) {

            const errorData = await response.json();

            console.error(errorData);

            return res.json({
                results: [],
                totalScore: 0
            });
        }

        const data = await response.json();

        const rawText =
            data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        const cleanedText = rawText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let parsed;

        try {

            parsed = JSON.parse(cleanedText);

        } catch (e) {

            console.error("JSON parse error:", cleanedText);

            parsed = { results: [] };
        }

        let totalScore = 0;

        parsed.results.forEach(r => {
            totalScore += r.score || 0;
        });

        res.json({
            results: parsed.results,
            totalScore
        });

    } catch (e) {

        console.error(e);

        res.json({
            results: [],
            totalScore: 0
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
