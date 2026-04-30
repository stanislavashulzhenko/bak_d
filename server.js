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
    console.log(req.body)
    const { transcript } = req.body;
    console.log(req.body)

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `
Tu esi stingrs un objektīvs IT studiju noslēguma darbu eksaminācijas komisijas loceklis.
Tavs uzdevums ir kritiski novērtēt studenta prezentācijas tekstu.

STRIKTIE NOTEIKUMI:
1. Ja teksts ir bezjēdzīgs, satur tikai nejaušus burtus (piemēram, "asdf", "sdfsdf"), sastāv no nesaistītiem vārdiem vai ir pārāk īss, lai veiktu analīzi – SCORE IR OBLIGĀTI 0.
2. Vērtē tikai pēc būtības: struktūra, argumentācija, loģiskums.
3. Neizdomā studenta vietā to, kā tur nav.

ATBILDES FORMĀTS (TIKAI ŠĀDS):
SCORE: <skaitlis no 0 līdz 100>
ATGRIEZENISKĀ SAITE:
- <1. ieteikums vai iemesls, kāpēc 0>
- <2. ieteikums vai iemesls>
- <3. ieteikums vai iemesls>

PREZENTĀCIJAS TEKSTS:
"${transcript}"
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        // --- ŠEIT IR TĀ VIETA, KUR JĀIEVIETO PĀRBAUDE ---
        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            // Svarīgi: pārtraucam izpildi un nosūtām kļūdu klientam
            return res.status(response.status).json({
                questions: [], // Atgriežam tukšu masīvu, lai frontends nesalūztu
                error: `API kļūda: ${response.status}`
            });
        }
        // ----------------------------------------------

        const data = await response.json();




        console.log("--- Google API Full Response ---");
        console.log(JSON.stringify(data, null, 2)); 
        console.log("--------------------------------");



        
        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Nav atbildes";


        console.log("--- AI RAW RESPONSE START ---");
        console.log(text);
        console.log("--- AI RAW RESPONSE END ---");


    const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
    let score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    score = Math.max(0, Math.min(100, score));




    const feedbackSection = text.split(/ATGRIEZENISKĀ SAITE:|IETEIKUMI:/i)[1];

    let feedback = [];
    if (feedbackSection) {
        
        feedback = feedbackSection
            .split('\n')
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .filter(line => line.length > 5); 
    }

    if (feedback.length === 0) {
        feedback = ["Nav specifisku ieteikumu (pārbaudiet teksta saturu)"];
    }

    res.json({
        score,
        feedback
    });
    


    } catch (e) {
        console.error(e);

        res.json({
            score: 70,
            feedback: [
                "Fallback režīms",
                "AI nav pieejams",
                "Pārbaudi API atslēgu"
            ]
        });
    }

    
});


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
                            text: `Tu esi bakalaura darba komisija. Izveido 6 jautājumus par šo darbu.
                            Tēma: ${topic}, Struktūra: ${structure}, Teksts: ${transcript}.
                            
                            ATBILDI TIKAI TĪRĀ JSON FORMĀTĀ (bez markdown precizējumiem):
                            {
                              "questions": [
                                {"level": "EASY", "text": "..."},
                                {"level": "EASY", "text": "..."},
                                {"level": "MEDIUM", "text": "..."},
                                {"level": "MEDIUM", "text": "..."},
                                {"level": "HARD", "text": "..."},
                                {"level": "HARD", "text": "..."}
                              ]
                            }`
                        }]
                    }]
                })
            }
        );

        // --- ŠEIT IR TĀ VIETA, KUR JĀIEVIETO PĀRBAUDE ---
        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            // Svarīgi: pārtraucam izpildi un nosūtām kļūdu klientam
            return res.status(response.status).json({
                questions: [], // Atgriežam tukšu masīvu, lai frontends nesalūztu
                error: `API kļūda: ${response.status}`
            });
        }
        // ----------------------------------------------

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        // Более надежный поиск JSON внутри текста (ищет всё между первым { и последним })
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
        // Резервный вариант, если ИИ упал
        res.json({
            questions: [
                {level: "EASY", text: "Kas ir darba mērķis?"},
                {level: "MEDIUM", text: "Kāpēc izvēlēta šī tehnoloģija?"},
                {level: "HARD", text: "Kādi ir sistēmas ierobežojumi?"}
            ]
        });
    }
});


// atbilzu analize

app.post("/analyze-answer", async (req, res) => {
    const { question, answer } = req.body;

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
Novērtē studenta atbildi.

Jautājums: ${question}
Atbilde: ${answer}

Dod:
SCORE: 0-100
FEEDBACK:
- ...
- ...
- ...
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        // --- ŠEIT IR TĀ VIETA, KUR JĀIEVIETO PĀRBAUDE ---
        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            // Svarīgi: pārtraucam izpildi un nosūtām kļūdu klientam
            return res.status(response.status).json({
                questions: [], // Atgriežam tukšu masīvu, lai frontends nesalūztu
                error: `API kļūda: ${response.status}`
            });
        }
        // ----------------------------------------------

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Регулярное выражение с флагом 'i' (независимо от регистра)
        const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
        let score = scoreMatch ? parseInt(scoreMatch[1]) : 0; // По умолчанию 0, а не 70, чтобы видеть ошибку

        // Ищем фидбек более гибко
        const feedbackParts = text.split(/FEEDBACK:|IETEIKUMI:/i)[1];
        const feedback = feedbackParts 
            ? feedbackParts.split('\n').map(l => l.replace(/^[-*•\s]+/, '').trim()).filter(l => l.length > 3)
            : ["Nav atsauksmes"];

        res.json({ score: Math.min(100, score), feedback });

    } catch (e) {
        res.json({
            score: 70,
            feedback: ["Fallback režīms"]
        });
    }
});











const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});










// app.listen(3000, () => {
//     console.log("Server running on http://localhost:3000");
// });


// node server js
