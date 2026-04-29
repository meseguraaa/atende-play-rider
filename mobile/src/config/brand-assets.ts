import { BRAND } from './brand';

const HOME_IMAGES = {
    atendeplay: require('../../brands/atendeplay/assets/images/home.png'),
    espacofk: require('../../brands/espacofk/assets/images/home.png'),
    borgesbarber: require('../../brands/borgesbarber/assets/images/home.png'),
    rosangelaaraujo: require('../../brands/rosangelaaraujo/assets/images/home.png'),
    pedepradeh: require('../../brands/pedepradeh/assets/images/home.png'),
    imagecorpus: require('../../brands/imagecorpus/assets/images/home.png'),
} as const;

export const BRAND_HOME_IMAGE =
    HOME_IMAGES[BRAND.slug as keyof typeof HOME_IMAGES] ??
    require('../../assets/images/home.png');
