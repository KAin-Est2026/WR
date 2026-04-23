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

// ===== TELEGRAM =====
async function sendMessage(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.log("TELEGRAM ERROR:", e.response?.data || e.message);
    }
}

// ===== MAIN =====
async function run() {
    let messages = [];

    for (let symbol of symbols) {
        try {
            const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1h&outputsize=120&apikey=${API_KEY}`;
            const res = await axios.get(url);

            if (!res.data || !res.data.values) {
                console.log("API ERROR:", symbol, res.data);
                continue;
            }

            let data = res.data.values.reverse();
            let prices = data.map(d => parseFloat(d.close));

            let last_price = prices.at(-1);

            // ===== INDICATORS =====
            let ema9 = ema(prices, 9);
            let ema21 = ema(prices, 21);

            let rsiVal = rsi(prices);

            let macd = ema(prices, 12).at(-1) - ema(prices, 26).at(-1);

            let bull = ema9.at(-1) > ema21.at(-1);
            let bear = ema9.at(-1) < ema21.at(-1);

            // ===== SCALPING =====
            let scalpBuy = rsiVal < 45 && macd > 0;
            let scalpSell = rsiVal > 55 && macd < 0;

            let signal = "⚪ NO SIGNAL";
            let tp = "-", sl = "-";

            // ===== SWING =====
            if (bull && rsiVal < 70 && macd > 0) {
                signal = "🔥 SWING BUY";
                tp = (last_price * 1.03).toFixed(2);
                sl = (last_price * 0.985).toFixed(2);
            }

            else if (bear && rsiVal > 30 && macd < 0) {
                signal = "🔥 SWING SELL";
                tp = (last_price * 0.97).toFixed(2);
                sl = (last_price * 1.015).toFixed(2);
            }

            // ===== SCALP PRIORITY =====
            if (scalpBuy) {
                signal = "⚡ SCALP BUY";
                tp = (last_price * 1.008).toFixed(2);
                sl = (last_price * 0.995).toFixed(2);
            }

            if (scalpSell) {
                signal = "⚡ SCALP SELL";
                tp = (last_price * 0.992).toFixed(2);
                sl = (last_price * 1.005).toFixed(2);
            }

            messages.push(
`*${symbol}*
Signal: ${signal}
Price: ${last_price}
TP: ${tp} | SL: ${sl}
RSI: ${rsiVal.toFixed(2)}`
            );

        } catch (err) {
            console.log("ERROR:", symbol, err.message);
        }
    }

    if (messages.length > 0) {
        await sendMessage(messages.join("\n\n"));
    } else {
        console.log("No signals");
    }
}

run();
