import * as Discord from "discord.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { setTimeout } from 'timers';
import { FetchEpicGamesDeals, Deal } from './EpicGamesWrapper';
import { Canvas, createCanvas, loadImage } from "canvas";

const debug = false;

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
    let now = Date.now();
    return json.map((obj: any): Deal => {
      let start = new Date(obj.startDate);
      let end = new Date(obj.endDate);
      return {
        title: obj.title,
        startDate: start,
        endDate: end,
        originalPrice: obj.originalPrice,
        image: obj.image,
        slug: obj.slug,
        active: (now > start.getTime() && now < end.getTime())
      };
    });
  }
  return [];
}

/**
 * Returns `true` if deal ends in less than 16 hours. Returns false if deal is expired.
 * @param deal 
 * @returns 
 */
function DealExpiresToday(deal: Deal): boolean {
  let diff = deal.endDate.getTime() - Date.now();
  const sixteenHours = 16 * 60 * 60 * 1000;
  return diff < sixteenHours && diff > 0;
}

async function DailyRoutine(): Promise<void> {
  let localDeals = GetDealsFromDisk();
  // remove any dead deals that expired since last iteration
  localDeals = localDeals.filter(deal => (deal.endDate.getTime() > Date.now()))
  let expiringToday: Deal[];

  // grab free games from EGS server
  return FetchEpicGamesDeals()
    .then(async (fetchedDeals) => {
      // remove any deals that returned with invalid start/end dates - bugfix MCG 5/19
      fetchedDeals = fetchedDeals.filter(deal => deal.startDate !== null && deal.endDate !== null);
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

      // find any deals that end today, report as last chance, sort by the soonest to expire
      expiringToday = localDeals.filter(deal => DealExpiresToday(deal)).sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
      let output: Discord.MessageEmbed[] = [];

      if (expiringToday.length > 0) {
        output.push(await CreateMultiDealEmbed(expiringToday));
      }
      // report any new deals also
      if (newDeals.length > 0) {
        output.push(await CreateMultiDealEmbed(newDeals));
      }
      // send to the 'scord
      output.forEach(msg => channel.send(msg));
    })
    .catch(err => {
      channel.send("Something went wrong, Trelane should check the error log and fix it.");
      ErrorLog(err);
    })
    .finally(() => {
      let d = new Date();
      let now = Date.now();
      let timeout: Date;
      if (expiringToday.length == 0) {
        // nothing expires today
        if (d.getDay() == 4 && d.getHours() < 12) {
          // thursday, check at noon for new stuff
          timeout = new Date();
          timeout.setHours(12, 30, 0, 0);
        } else {
          // run again at 7am tomorrow
          now += (1000 * 60 * 60 * 24);
          timeout = new Date(now);
          timeout.setHours(7, 0, 0, 0);
        }
      } else {
        // deals expire today, check later
        const halfhour = 30 * 60 * 1000;
        timeout = new Date(expiringToday[0].endDate.getTime() + halfhour);
      }
      setTimeout(DailyRoutine, timeout.getTime() - Date.now());
    });
}

async function CreateMultiDealEmbed(deals: Deal[]): Promise<Discord.MessageEmbed> {
  let embed = new Discord.MessageEmbed();

  let color: number;
  let description: string;

  let now = Date.now();
  if (now < deals[0].startDate.getTime()) {
    // deal has not started yet
    color = 0xdad45e;
    description = "Sensors have detected an upcoming free game.";
  } else if (DealExpiresToday(deals[0])) {
    // deal expires today
    color = 0xd04648;
    description = "Last chance! This deal expires today.";
  } else {
    // deal is current and active
    color = 0x346524;
    description = "This deal is currently ongoing.";
  }

  embed.setColor(color);

  // Construct title. Should look like "Worms 1, Worms 2, and Worms Armageddon"
  let title = deals[0].title;
  if (deals.length == 2) {
    title += ` and ${deals[1].title}`;
  } else if (deals.length > 2) {
    for (let i = 1; i < deals.length; i++) {
      if (i == deals.length - 1) {
        title += `, and ${deals[i].title}`;
      } else {
        title += `, ${deals[i].title}`;
      }
    }
  }
  embed.setTitle(title);

  if (deals.length == 1) {
    embed.setURL(`https://www.epicgames.com/store/en-US/p/${deals[0].slug}`);
  } else {
    embed.setURL("https://www.epicgames.com/store/en-US/free-games");
  }

  embed.setAuthor("Epic Games Store", "attachment://egs_logo.png", "https://www.epicgames.com/store/");
  embed.setDescription(description);
  embed.setThumbnail(client.user.avatarURL());

  deals.forEach(deal => embed.addField(deal.title, `~~$${deal.originalPrice / 100}~~ **FREE**`, false));

  //TODO: Create a thumbnail image of all deals
  let canvas = await CreateMultiThumbnail(deals);

  embed.setImage("attachment://multi.jpg");

  let footer = "Offer found by the Narn, ";
  footer += deals[0].active ? "ends " : "begins ";
  footer += deals[0].active ? deals[0].endDate.toDateString() : deals[0].startDate.toDateString();
  embed.setFooter(footer, client.user.avatarURL());

  embed.attachFiles([
    new Discord.MessageAttachment("./assets/egs_logo.png"),
    new Discord.MessageAttachment(canvas.createJPEGStream(), "multi.jpg")
  ]);

  return Promise.resolve(embed);
}

async function CreateMultiThumbnail(deals: Deal[]): Promise<Canvas> {
  let width = 0;
  let height = 0;
  let images = [];
  for (let i = 0; i < deals.length; i++) {
    let ima = await loadImage(deals[i].image);
    images.push(ima);
    width += ima.width;
    height = Math.max(height, ima.height);
  }
  let canvas = createCanvas(width, height);
  let ctx = canvas.getContext("2d");
  let x = 0;
  for (let i = 0; i < deals.length; i++) {
    ctx.drawImage(images[i], x, 0);
    x += images[i].width;
  }
  return Promise.resolve(canvas);
}

//TODO: No longer needed? Delete
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
  if (debug) {
    //DEBUG: use test channel
    channel = client.channels.cache.find(ch => (ch instanceof Discord.TextChannel && ch.id == "536674689872035840")) as Discord.TextChannel;
  } else {
    //PRODUCTION: use #wingnut
    channel = client.channels.cache.find(ch => (ch instanceof Discord.TextChannel && ch.name == "wingnut")) as Discord.TextChannel;
  }
  setTimeout(DailyRoutine, 0);
});

client.login(process.env.BOT_TOKEN);