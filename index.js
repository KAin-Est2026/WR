require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const API_KEY = process.env.API_KEY;

const symbols = ["BTC/USD", "XAU/USD"];

// ================= EMA =================
function ema(values, period) {
    let k = 2 / (period + 1);
    let arr = [values[0]];
    for (let i = 1; i < values.length; i++) {
        arr.push(values[i] * k + arr[i - 1] * (1 - k));
    }
    return arr;
}

// ================= RSI =================
function rsi(values, period = 14) {
    let gains = 0, losses = 0;

    for (let i = values.length - period; i < values.length - 1; i++) {
        let diff = values[i + 1] - values[i];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }

    if (losses === 0) return 100;
    if (gains === 0) return 0;

    let rs = gains / losses;
    return 100 - (100 / (1 + rs));
}

// ================= TELEGRAM =================
async function send(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.log("TG ERROR:", e.response?.data || e.message);
    }
}

// ================= MAIN =================
async function run() {
    let messages = [];

    for (let symbol of symbols) {

        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1h&outputsize=120&apikey=${API_KEY}`;
        const res = await axios.get(url);

        if (!res.data?.values) continue;

        let data = res.data.values.reverse();
        let prices = data.map(d => parseFloat(d.close));

        let price = prices.at(-1);

        let ema9 = ema(prices, 9);
        let ema21 = ema(prices, 21);

        let rsiVal = rsi(prices);
        let macd = ema(prices, 12).at(-1) - ema(prices, 26).at(-1);

        let bull = ema9.at(-1) > ema21.at(-1);
        let bear = ema9.at(-1) < ema21.at(-1);

        // ================= SWING =================
        let swing = "⚪ NO SWING SIGNAL";
        let swingEmoji = "😐";

        if (bull && rsiVal < 70 && macd > 0) {
            swing = "🔥 SWING BUY";
            swingEmoji = "📈🚀";
        }

        else if (bear && rsiVal > 30 && macd < 0) {
            swing = "🔥 SWING SELL";
            swingEmoji = "📉⚡";
        }

        // ================= SCALPING (BOOSTED) =================
        let scalp = "⚪ NO SCALP";
        let scalpEmoji = "😴";

        // kuchaytirilgan scalping logic
        if (rsiVal < 50 && macd > 0) {
            scalp = "⚡ SCALP BUY";
            scalpEmoji = "🟢⚡📊";
        }

        else if (rsiVal < 45 && macd > 0 && bull) {
            scalp = "🚀 STRONG SCALP BUY";
            scalpEmoji = "🔥🚀📈";
        }

        else if (rsiVal > 50 && macd < 0) {
            scalp = "⚡ SCALP SELL";
            scalpEmoji = "🔴⚡📉";
        }

        else if (rsiVal > 55 && macd < 0 && bear) {
            scalp = "💥 STRONG SCALP SELL";
            scalpEmoji = "🔥📉💣";
        }

        messages.push(
`*${symbol}*

💰 Price: ${price}

📊 SWING: ${swing} ${swingEmoji}

⚡ SCALP: ${scalp} ${scalpEmoji}

📉 RSI: ${rsiVal.toFixed(2)}
📈 MACD: ${macd.toFixed(2)}`
        );
    }

    if (messages.length) {
        await send(messages.join("\n\n"));
    }
}

run();
