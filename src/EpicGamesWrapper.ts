import fetch from "node-fetch";

export interface Deal {
  title: string;
  startDate: Date;
  endDate: Date;
  originalPrice: number;
  image: string;
  slug: string;
  active: boolean;
}

export async function FetchEpicGamesDeals(): Promise<Deal[]> {
  return fetch(process.env.EPIC_GAMES_URL)
    .then(res => res.json())
    .then(json => {
      let deals = ParseReturnedData(json.data);
      return deals;
    });
}

function ParseReturnedData(data: any): Deal[] {
  let returnedDeals = data.Catalog.searchStore.elements;
  let processedDeals: Deal[] = [];
  for (let i = 0; i < returnedDeals.length; i++) {
    let deal = BuildDealObject(returnedDeals[i]);
    if (deal) {
      processedDeals.push(deal);
    }
  }
  return processedDeals;
}

interface EGSTotalPromotions {
  promotionalOffers: EGSPromotions[],
  upcomingPromotionalOffers: EGSPromotions[]
}

interface EGSPromotions {
  promotionalOffers: EGSOffer[]
}

interface EGSOffer {
  startDate: string;
  endDate: string;
  discountSetting: {
    discountType: string;
    discountPercentage: number;
  };
}

interface EGSImageData {
  type: string;
  url: string;
}

interface EGSOfferData {
  title?: string;
  slug?: string;
  price?: {
    totalPrice: {
      discountPrice: number;
      originalPrice: number;
    }
  };
  promotions?: EGSTotalPromotions;
  keyImages?: EGSImageData[];
  productSlug?: string;
}

function BuildDealObject(data: EGSOfferData): Deal {
  let deal: Deal = {
    title: null,
    startDate: null,
    endDate: null,
    originalPrice: null,
    image: null,
    slug: null,
    active: false
  };

  // title
  if (data.title) {
    deal.title = data.title;
  } else {
    throw "Error in returned JSON data. Title is null.";
  }

  // original price
  if (data.price.totalPrice.originalPrice) {
    deal.originalPrice = data.price.totalPrice.originalPrice;
  } else {
    if (data.price.totalPrice.originalPrice == 0) {
      // not a discounted free game, abort
      return null;
    }
    throw "Error when parsing deal JSON. originalPrice is null";
  }

  // start/end dates
  if (data.promotions) {
    let promotions: EGSTotalPromotions = data.promotions;
    if (promotions.promotionalOffers.length > 0) {
      // it might currently be free, check!
      promotions.promotionalOffers.forEach((subset: EGSPromotions) => {
        if (subset.promotionalOffers) {
          let currentOffers = subset.promotionalOffers;
          currentOffers.forEach((offer: EGSOffer) => {
            if (offer.discountSetting.discountPercentage == 0) {
              // percentage is 0, is free? --unconfirmed
              deal.startDate = new Date(offer.startDate);
              deal.endDate = new Date(offer.endDate);
              deal.active = true;
            }
          })
        }
      })
    }
    if (promotions.upcomingPromotionalOffers.length > 0) {
      // maybe it's free in the future, check!
      promotions.upcomingPromotionalOffers.forEach((subset: EGSPromotions) => {
        if (subset.promotionalOffers) {
          let futureOffers = subset.promotionalOffers;
          futureOffers.forEach((offer: EGSOffer) => {
            if (offer.discountSetting.discountPercentage == 0) {
              // percentage is 0, is free? --unconfirmed
              deal.startDate = new Date(offer.startDate);
              deal.endDate = new Date(offer.endDate);
            }
          })
        }
      })
    }
  } else {
    // if data.promotions is null, the game is F2P, discard it
    return null;
  }

  // image
  let images = data.keyImages;
  images.forEach((image: any) => {
    if (image.type == "Thumbnail") {
      deal.image = image.url;
    }
  });
  if (deal.image == null) {
    throw "Error when parsing deal JSON. Couldn't find thumbnail image.";
  }

  // slug
  if (data.productSlug) {
    deal.slug = data.productSlug;
  } else {
    throw "Error when parsing deal JSON. Couldn't find productSlug";
  }

  return deal;
}
