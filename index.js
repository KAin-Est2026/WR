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

// ================= SCORE ENGINE =================
function calculateScore({ bull, bear, rsiVal, macd }) {
    let score = 50;

    if (bull) score += 15;
    if (bear) score += 15;

    if (macd > 0) score += 10;
    if (macd < 0) score += 10;

    if (rsiVal > 40 && rsiVal < 60) score += 10;

    if (rsiVal > 70 || rsiVal < 30) score -= 20;

    return Math.max(0, Math.min(100, score));
}

// ================= TELEGRAM =================
async function send(text) {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown"
    });
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

        // indicators
        let ema9 = ema(prices, 9);
        let ema21 = ema(prices, 21);

        let rsiVal = rsi(prices);
        let macd = ema(prices, 12).at(-1) - ema(prices, 26).at(-1);

        let bull = ema9.at(-1) > ema21.at(-1);
        let bear = ema9.at(-1) < ema21.at(-1);

        // ================= SCORE =================
        let score = calculateScore({ bull, bear, rsiVal, macd });

        let direction = "NEUTRAL";
        let signal = "⚪ NO TRADE";

        let tp = "-", sl = "-";

        // ================= DECISION =================
        if (score >= 80 && bull) {
            direction = "BULLISH";
            signal = "🔥 STRONG BUY";
            tp = (price * 1.03).toFixed(2);
            sl = (price * 0.985).toFixed(2);
        }

        else if (score >= 80 && bear) {
            direction = "BEARISH";
            signal = "🔥 STRONG SELL";
            tp = (price * 0.97).toFixed(2);
            sl = (price * 1.015).toFixed(2);
        }

        else if (score >= 65) {
            signal = "⚡ WEAK SIGNAL (skip recommended)";
        }

        messages.push(
`*${symbol}*

Price: ${price}

Score: ${score}/100
Bias: ${direction}

Signal: ${signal}

TP: ${tp} | SL: ${sl}

RSI: ${rsiVal.toFixed(2)}`
        );
    }

    if (messages.length) {
        await send(messages.join("\n\n"));
    }
}

run();
