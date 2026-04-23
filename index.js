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

// ================= MAIN =================
async function run() {

    if (!TOKEN || !CHAT_ID || !API_KEY) {
        console.log("❌ Missing ENV variables");
        return;
    }

    let messages = [];

    for (let symbol of symbols) {
        try {
            const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1h&outputsize=120&apikey=${API_KEY}`;
            const res = await axios.get(url);

            if (!res.data || !res.data.values) {
                console.log("API ERROR:", symbol, res.data);
                continue;
            }

            let data = [...res.data.values].reverse();
            let prices = data.map(d => parseFloat(d.close));

            let last_price = prices.at(-1);

            // EMA
            let ema9 = ema(prices, 9);
            let ema21 = ema(prices, 21);

            let last_ema9 = ema9.at(-1);
            let last_ema21 = ema21.at(-1);

            let prev_ema9 = ema9.at(-2);
            let prev_ema21 = ema21.at(-2);

            // RSI
            let last_rsi = rsi(prices);

            // MACD (simple)
            let macd = ema(prices, 12).at(-1) - ema(prices, 26).at(-1);
            let macd_strength = Math.abs(macd);

            let ema_diff = Math.abs(last_ema9 - last_ema21);

            let signal = "⚪ NO SIGNAL";
            let tp = "-", sl = "-";

            let bull = prev_ema9 < prev_ema21 && last_ema9 > last_ema21;
            let bear = prev_ema9 > prev_ema21 && last_ema9 < last_ema21;

            // ================= PRO FILTER =================

            if (
                bull &&
                last_rsi > 45 && last_rsi < 75 &&
                macd > 0 &&
                macd_strength > 0.03 &&
                ema_diff / last_price > 0.00025
            ) {
                signal = "🔥 STRONG BUY";
                tp = (last_price * 1.025).toFixed(2);
                sl = (last_price * 0.99).toFixed(2);
            }

            else if (
                bear &&
                last_rsi < 55 && last_rsi > 25 &&
                macd < 0 &&
                macd_strength > 0.03 &&
                ema_diff / last_price > 0.00025
            ) {
                signal = "🔥 STRONG SELL";
                tp = (last_price * 0.975).toFixed(2);
                sl = (last_price * 1.01).toFixed(2);
            }

            else {
                signal = "⚪ WEAK / WAIT";
            }

            messages.push(
`*${symbol}*
Signal: ${signal}
Price: ${last_price}
TP: ${tp} | SL: ${sl}
RSI: ${last_rsi.toFixed(2)}`
            );

        } catch (err) {
            console.log("ERROR:", symbol, err.message);
        }
    }

    // ================= TELEGRAM =================
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: messages.join("\n\n") || "No signal",
            parse_mode: "Markdown"
        });
    } catch (err) {
        console.log("TELEGRAM ERROR:", err.response?.data || err.message);
    }
}

run();
