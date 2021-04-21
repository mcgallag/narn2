import { FetchEpicGamesDeals, Deal } from './EpicGamesWrapper';
import * as Discord from "discord.js";
import fs = require("fs");
import dotenv = require('dotenv');
import { setTimeout } from 'timers';
dotenv.config();

function ErrorLog(err: string): void {
  fs.writeFileSync(process.env.ERROR_LOG, err + "\n", {
    encoding: "utf8",
    flag: "a"
  });
}

function WriteDealsToDisk(deals: Deal[]): void {
  fs.writeFileSync(process.env.SAVED_DEALS, JSON.stringify(deals));
}

function GetDealsFromDisk(): Deal[] {
  if (fs.existsSync(process.env.SAVED_DEALS)) {
    let raw = fs.readFileSync(process.env.SAVED_DEALS, "utf8");
    let json = JSON.parse(raw);
    return json.map((obj: any): Deal => {
      return {
        title: obj.title,
        startDate: new Date(obj.startDate),
        endDate: new Date(obj.endDate),
        originalPrice: obj.originalPrice,
        image: obj.image,
        slug: obj.slug,
        active: obj.active
      }
    })
  }
  return [];
}

/**
 * Returns `true` if deal ends in less than 16 hours
 * @param deal 
 * @returns 
 */
function DealExpiresToday(deal: Deal): boolean {
  let diff = deal.endDate.getTime() - Date.now();
  const sixteenHours = 16 * 60 * 60 * 1000;
  return diff < sixteenHours;
}

function DailyRoutine(): void {
  let localDeals = GetDealsFromDisk();
  // remove any dead deals that expired since last iteration
  localDeals = localDeals.filter(deal => (deal.endDate.getTime() > Date.now()))

  // grab free games from EGS server
  FetchEpicGamesDeals()
    .then(fetchedDeals => {
      // add any new deals to local cache
      let newDeals: Deal[] = [];
      fetchedDeals.forEach(deal => {
        if (!localDeals.some(check => (check.title == deal.title))) {
          // we found a new deal, we need to report this as detected
          localDeals.push(deal);
          newDeals.push(deal);
        }
      });
      WriteDealsToDisk(localDeals);

      // find any deals that end today, report as last chance
      let expiringToday = localDeals.filter(deal => DealExpiresToday(deal));
      let output: Discord.MessageEmbed[] = expiringToday.map(deal => CreateEmbedForDeal(deal));
      // report any new deals also
      output.push(...newDeals.map(deal => CreateEmbedForDeal(deal)));
      // send to the 'scord
      if (output.length == 0) {
        console.log("nothing new found");
      }
      output.forEach(msg => channel.send(msg));
    })
    .catch(err => {
      channel.send("Something went wrong, Trelane should check the error log and fix it.");
      ErrorLog(err);
    })
    .finally(() => {
      // run again at 7am tomorrow
      let now = Date.now();
      now += (1000 * 60 * 60 * 24);
      let timeout = new Date(now);
      timeout.setHours(7, 0, 0, 0);
      setTimeout(DailyRoutine, timeout.getTime() - Date.now());
    });
}

function CreateEmbedForDeal(deal: Deal): Discord.MessageEmbed {
  let embed = new Discord.MessageEmbed();

  // vary depending on if deal is current, upcoming, or expiring
  let color: number;
  let description: string;

  let now = Date.now();
  if (now < deal.startDate.getTime()) {
    // deal has not started yet
    color = 0xdad45e;
    description = "Sensors have detected an upcoming free game."
  } else if (DealExpiresToday(deal)) {
    // deal expires today
    color = 0xd04648;
    description = "Last chance! This deal expires today.";
  } else {
    // deal is active and not expiring today
    color = 0x346524;
    description = "This deal is currently ongoing.";
  }
  embed.setColor(color);
  embed.setTitle(deal.title);
  embed.setURL(`https://www.epicgames.com/store/en-US/p/${deal.slug}`);
  embed.setAuthor("Epic Games Store", "attachment://egs_logo.png", "https://www.epicgames.com/store/");
  embed.setDescription(description);
  embed.setThumbnail(client.user.avatarURL());
  embed.addFields(
    { name: "Regular Price", value: `$${deal.originalPrice / 100}`, inline: true },
    { name: "Sale Starts", value: deal.startDate.toDateString(), inline: true }
  );
  embed.setImage(deal.image);

  let footer = "Offer found by the Narn, ";
  footer += deal.active ? "ends " : "begins ";
  footer += deal.active ? deal.endDate.toDateString() : deal.startDate.toDateString();
  embed.setFooter(footer, client.user.avatarURL());

  embed.attachFiles([
    new Discord.MessageAttachment("./assets/egs_logo.png")
  ]);

  return embed;
}

const client = new Discord.Client();
let channel: Discord.TextChannel;
client.once('ready', () => {
  // find pin-commander snowflake
  // let channel = client.channels.cache.find(ch => (ch instanceof Discord.TextChannel && ch.name == "pin-commander"));
  //DEBUG: use test channel
  channel = client.channels.cache.find(ch => (ch instanceof Discord.TextChannel && ch.id == "536674689872035840")) as Discord.TextChannel;
  setTimeout(DailyRoutine, 0);
});

client.login(process.env.BOT_TOKEN);