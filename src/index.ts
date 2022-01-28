import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { checkArbitrage } from "./inchPrice";
import { baseTokens, interval, tradingTokens, renderInterval } from "./config";
import { flashloan } from "./flashloan";
import chalk = require("chalk");

const readline = require("readline");
const { Table } = require("console-table-printer");

export const main = async () => {
  console.clear();

  let isFlashLoaning = false;

  const [maxX, _] = process.stdout.getWindowSize();

  const p = new Table({
    // title: "Quotes",
    columns: [
      { name: "index", title: "#", alignment: "right" },

      { name: "fromToken", title: "From", alignment: "left" },
      { name: "fromAmount", title: "Amount", alignment: "right" },

      { name: "toToken", title: "To", alignment: "left" },
      { name: "toAmount", title: "Amount", alignment: "right" },

      { name: "difference", title: "±", alignment: "right" },
      { name: "percentage", title: "%", alignment: "right" },

      { name: "log", title: "Log", alignment: "left", maxLen: maxX - 101 },

      { name: "time", title: "Time", alignment: "right" },
      { name: "timestamp", title: "Timestamp", alignment: "right" },
    ],
  });

  const pp = new Table({
    title: "Flash Loans",
    columns: [
      { name: "baseToken", title: "From", alignment: "left" },
      { name: "tradingToken", title: "To", alignment: "left" },

      { name: "amount", title: "Amount", alignment: "right" },

      { name: "difference", title: "±", alignment: "right" },
      { name: "percentage", title: "%", alignment: "right" },

      {
        name: "firstRoutes",
        title: "First Routes",
        alignment: "left",
        maxLen: maxX / 2 - 78,
      },
      {
        name: "secondRoutes",
        title: "Second Routes",
        alignment: "left",
        maxLen: maxX / 2 - 79,
      },

      {
        name: "txHash",
        title: "Transaction Hash",
        alignment: "left",
      },

      { name: "time", title: "Time", alignment: "right" },
      { name: "timestamp", title: "Timestamp", alignment: "right" },
    ],
  });

  let idx = 0;
  baseTokens.forEach(async (baseToken) => {
    tradingTokens.forEach(async (tradingToken) => {
      if (baseToken.address > tradingToken.address) {
        p.addRow({
          index: idx,

          fromToken: (baseToken === tradingToken
            ? ""
            : baseToken.symbol
          ).padEnd(6),
          toToken: (baseToken === tradingToken
            ? ""
            : tradingToken.symbol
          ).padEnd(6),

          fromAmount: "".padStart(7),
          toAmount: "".padStart(7),

          difference: "".padStart(7),
          percentage: "".padStart(5),

          time: "".padStart(6),
          timestamp: "".padStart(24),
        });

        idx++;
      }
    });
  });

  idx = 0;
  const renderTables = () => {
    // console.clear();
    readline.cursorTo(process.stdout, 0, 0);

    p.printTable();

    if (pp.table.rows.length > 0) {
      pp.printTable();
    }
  };

  renderTables();

  const chalkTime = (time: number) => {
    if (time < 0.1) {
      return "";
    }
    const timeStr = time.toFixed(1) + "s";
    if (time < 3) {
      return timeStr;
    } else if (time < 6) {
      return chalk.yellow(timeStr);
    } else {
      return chalk.red(timeStr);
    }
  };

  // const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  setInterval(() => {
    renderTables();
  }, renderInterval);

  baseTokens.forEach(async (baseToken) => {
    tradingTokens.forEach(async (tradingToken) => {
      // prevent swapping the same pair
      if (baseToken.address > tradingToken.address) {
        const i = idx;

        // await delay(interval / (baseTokens.length * tradingTokens.length) * i)

        const func = async () => {
          const startTime = Date.now();

          const [
            isProfitable,
            firstProtocols,
            secondProtocols,
            amount,
            difference,
            percentage,
          ] = await checkArbitrage(
            baseToken,
            tradingToken,

            (text: any, options?: any) => {
              text.time = chalkTime((Date.now() - startTime) / 1000).padStart(
                6
              );
              text.timestamp = new Date().toISOString();

              p.table.createColumnFromRow(text);
              p.table.rows[i] = {
                color: options?.color || p.table.rows[i].color,
                separator:
                  options?.separator !== undefined
                    ? options?.separator
                    : p.table.rows[i].separator,
                text: { ...p.table.rows[i].text, ...text },
              };
            }
          );

          renderTables();

          if (isProfitable && !isFlashLoaning) {
            if (firstProtocols && secondProtocols) {
              isFlashLoaning = true;

              const startTime = Date.now();

              const tx = await flashloan(
                baseToken,
                firstProtocols,
                secondProtocols
              );

              pp.addRow({
                baseToken: baseToken.symbol.padEnd(6),
                tradingToken: tradingToken.symbol.padEnd(6),

                amount: (amount || "").padStart(7),
                difference: (difference || "").padStart(6),
                percentage: (percentage || "").padStart(4),

                firstRoutes: firstProtocols.map((routes) =>
                  routes.map((hops) =>
                    hops
                      .map((swap) => swap.name.replace("POLYGON_", ""))
                      .join(" → ")
                  )
                ),
                secondRoutes: secondProtocols.map((routes) =>
                  routes.map((hops) =>
                    hops
                      .map((swap) => swap.name.replace("POLYGON_", ""))
                      .join(" → ")
                  )
                ),

                txHash: tx.hash.padStart(66),

                time: chalkTime((Date.now() - startTime) / 1000).padStart(6),
                timestamp: new Date().toISOString(),
              });

              isFlashLoaning = false;

              renderTables();
            }
          }
        };

        func();

        setInterval(func, interval);

        idx++;
      }
    });
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
