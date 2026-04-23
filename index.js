require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const API_KEY = process.env.API_KEY;

const symbols = ["BTC/USD", "XAU/USD"];

// ===== EMA =====
function ema(values, period) {
    let k = 2 / (period + 1);
    let arr = [values[0]];
    for (let i = 1; i < values.length; i++) {
        arr.push(values[i] * k + arr[i - 1] * (1 - k));
    }
    return arr;
}

// ===== RSI =====
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

// ===== SAFE FETCH =====
async function getData(symbol) {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1h&outputsize=120&apikey=${API_KEY}`;
    const res = await axios.get(url);

    if (!res.data.values) {
        console.log("API ERROR:", symbol, res.data);
        return null;
    }

    return res.data.values.reverse();
}

// ===== STRATEGY =====
function analyze(prices) {

    let ema9 = ema(prices, 9);
    let ema21 = ema(prices, 21);

    let ema50 = ema(prices, 50);

    let r = rsi(prices);
    let price = prices.at(-1);

    let crossUp = ema9.at(-2) < ema21.at(-2) && ema9.at(-1) > ema21.at(-1);
    let crossDown = ema9.at(-2) > ema21.at(-2) && ema9.at(-1) < ema21.at(-1);

    let trendBull = ema21.at(-1) > ema50.at(-1);
    let trendBear = ema21.at(-1) < ema50.at(-1);

    // ===== SCALPING =====
    if (crossUp && r > 50 && r < 70) {
        return {
            type: "SCALPING BUY ⚡",
            entry: price,
            tp: price * 1.008,
            sl: price * 0.996
        };
    }

    if (crossDown && r < 50 && r > 30) {
        return {
            type: "SCALPING SELL ⚡",
            entry: price,
            tp: price * 0.992,
            sl: price * 1.004
        };
    }

    // ===== SWING =====
    if (trendBull && r > 55 && crossUp) {
        return {
            type: "SWING BUY 🔥",
            entry: price,
            tp: price * 1.03,
            sl: price * 0.985
        };
    }

    if (trendBear && r < 45 && crossDown) {
        return {
            type: "SWING SELL 🔥",
            entry: price,
            tp: price * 0.97,
            sl: price * 1.015
        };
    }

    return null;
}

// ===== TELEGRAM =====
async function send(msg) {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: msg,
        parse_mode: "Markdown"
    });
}

// ===== RUN =====
async function run() {

    let messages = [];

    for (let symbol of symbols) {

        let data = await getData(symbol);
        if (!data) continue;

        let prices = data.map(d => parseFloat(d.close));

        let signal = analyze(prices);

        if (!signal) {
            messages.push(`*${symbol}*\nNo trade setup ⏳`);
            continue;
        }

        messages.push(
`*${symbol}*
Type: ${signal.type}
Entry: ${signal.entry.toFixed(2)}
TP: ${signal.tp.toFixed(2)}
SL: ${signal.sl.toFixed(2)}`
        );
    }

    await send(messages.join("\n\n"));
}

run();
