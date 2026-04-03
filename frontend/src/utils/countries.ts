export function getCountryName(countryCode?: string) {
    if (!countryCode || countryCode === "00") return "";
    const names: { [key: string]: string } = {
        "ad": "Andorra", "ae": "U.A.E.", "af": "Afghanistan", "ag": "Antigua & Barbuda", "ai": "Anguilla", "al": "Albania", "am": "Armenia", "ao": "Angola", "ar": "Argentina", "as": "American Samoa", "at": "Austria", "au": "Australia", "aw": "Aruba", "az": "Azerbaijan",
        "ba": "Bosnia", "bb": "Barbados", "bd": "Bangladesh", "be": "Belgium", "bf": "Burkina Faso", "bg": "Bulgaria", "bh": "Bahrain", "bi": "Burundi", "bj": "Benin", "bm": "Bermuda", "bn": "Brunei", "bo": "Bolivia", "bq": "Bonaire", "br": "Brazil", "bs": "Bahamas", "bt": "Bhutan", "bw": "Botswana", "by": "Belarus", "bz": "Belize",
        "ca": "Canada", "cd": "Congo (DRC)", "cf": "Central Africa", "cg": "Congo", "ch": "Switzerland", "ci": "Ivory Coast", "ck": "Cook Islands", "cl": "Chile", "cm": "Cameroon", "cn": "China", "co": "Colombia", "cr": "Costa Rica", "cu": "Cuba", "cv": "Cape Verde", "cw": "Curaçao", "cy": "Cyprus", "cz": "Czech Rep.",
        "de": "Germany", "dj": "Djibouti", "dk": "Denmark", "dm": "Dominica", "do": "Dominican Rep.", "dz": "Algeria",
        "ec": "Ecuador", "ee": "Estonia", "eg": "Egypt", "er": "Eritrea", "es": "Spain", "et": "Ethiopia",
        "fi": "Finland", "fj": "Fiji", "fk": "Falkland Is.", "fo": "Faroe Is.", "fr": "France",
        "ga": "Gabon", "gb": "UK", "gd": "Grenada", "ge": "Georgia", "gf": "French Guiana", "gh": "Ghana", "gi": "Gibraltar", "gl": "Greenland", "gm": "Gambia", "gn": "Guinea", "gp": "Guadeloupe", "gq": "Equatorial Guinea", "gr": "Greece", "gt": "Guatemala", "gu": "Guam", "gw": "Guinea-Bissau", "gy": "Guyana",
        "hk": "Hong Kong", "hn": "Honduras", "hr": "Croatia", "ht": "Haiti", "hu": "Hungary",
        "id": "Indonesia", "ie": "Ireland", "il": "Israel", "in": "India", "iq": "Iraq", "ir": "Iran", "is": "Iceland", "it": "Italy",
        "jm": "Jamaica", "jo": "Jordan", "jp": "Japan",
        "ke": "Kenya", "kg": "Kyrgyzstan", "kh": "Cambodia", "kn": "St Kitts & Nevis", "kp": "North Korea", "kr": "South Korea", "kw": "Kuwait", "ky": "Cayman Is.", "kz": "Kazakhstan",
        "lb": "Lebanon", "lc": "St Lucia", "li": "Liechtenstein", "lk": "Sri Lanka", "lr": "Liberia", "ls": "Lesotho", "lt": "Lithuania", "lu": "Luxembourg", "lv": "Latvia", "ly": "Libya",
        "ma": "Morocco", "mc": "Monaco", "md": "Moldova", "me": "Montenegro", "mg": "Madagascar", "mh": "Marshall Is.", "mk": "North Macedonia", "ml": "Mali", "mm": "Myanmar", "mn": "Mongolia", "mo": "Macao", "mp": "N. Mariana Is.", "mq": "Martinique", "mr": "Mauritania", "ms": "Montserrat", "mt": "Malta", "mu": "Mauritius", "mv": "Maldives", "mw": "Malawi", "mx": "Mexico", "my": "Malaysia", "mz": "Mozambique",
        "na": "Namibia", "ne": "Niger", "ng": "Nigeria", "ni": "Nicaragua", "nl": "Netherlands", "no": "Norway", "np": "Nepal", "nz": "New Zealand",
        "om": "Oman",
        "pa": "Panama", "pe": "Peru", "pf": "Fr. Polynesia", "pg": "P.N.G.", "ph": "Philippines", "pk": "Pakistan", "pl": "Poland", "pm": "St Pierre", "pr": "Puerto Rico", "pt": "Portugal", "py": "Paraguay",
        "qa": "Qatar",
        "ro": "Romania", "rs": "Serbia", "ru": "Russia", "rw": "Rwanda",
        "sa": "Saudi Arabia", "sb": "Solomon Is.", "sc": "Seychelles", "sd": "Sudan", "se": "Sweden", "sg": "Singapore", "sh": "St Helena", "si": "Slovenia", "sk": "Slovakia", "sl": "Sierra Leone", "sm": "San Marino", "sn": "Senegal", "so": "Somalia", "sr": "Suriname", "st": "Sao Tome", "sv": "El Salvador", "sy": "Syria", "sz": "Eswatini",
        "tc": "Turks & Caicos", "td": "Chad", "tf": "Fr. S. Terr.", "tg": "Togo", "th": "Thailand", "tj": "Tajikistan", "tl": "Timor-Leste", "tm": "Turkmenistan", "tn": "Tunisia", "tr": "Turkey", "tt": "Trinidad", "tw": "Taiwan", "tz": "Tanzania",
        "ua": "Ukraine", "ug": "Uganda", "us": "USA", "uy": "Uruguay", "uz": "Uzbekistan",
        "va": "Vatican City", "vc": "St Vincent", "ve": "Venezuela", "vg": "Brit. Virgin Is.", "vi": "U.S. Virgin Is.", "vn": "Vietnam", "vu": "Vanuatu",
        "ws": "Samoa",
        "ye": "Yemen",
        "za": "South Africa", "zm": "Zambia", "zw": "Zimbabwe"
    };
    return names[countryCode.toLowerCase()] || countryCode.toUpperCase();
}

export function getFlagEmoji(mmsiStr?: string, countryCode?: string) {
    const mid = mmsiStr ? mmsiStr.substring(0, 3) : '';
    let emoji = '🏳️';
    
    const midToEmoji: { [key: string]: string } = {
        // Europe
        "201": "🇦🇱", "202": "🇦🇩", "203": "🇦🇹", "204": "🇵🇹", "205": "🇧🇪", "206": "🇧🇾", "207": "🇧🇬", "208": "🇻🇦",
        "209": "🇨🇾", "210": "🇨🇾", "212": "🇨🇾", "229": "🇲🇹", "215": "🇲🇹", "248": "🇲🇹", "249": "🇲🇹", "256": "🇲🇹",
        "211": "🇩🇪", "218": "🇩🇪", "213": "🇬🇪", "214": "🇲🇩", "216": "🇦🇲", "219": "🇩🇰", "220": "🇩🇰", "231": "🇫🇴",
        "224": "🇪🇸", "225": "🇪🇸", "226": "🇫🇷", "227": "🇫🇷", "228": "🇫🇷", "230": "🇫🇮", "232": "🇬🇧", "233": "🇬🇧",
        "234": "🇬🇧", "235": "🇬🇧", "236": "🇬🇮", "237": "🇬🇷", "239": "🇬🇷", "240": "🇬🇷", "241": "🇬🇷", "238": "🇭🇷",
        "242": "🇲🇦", "243": "🇭🇺", "244": "🇳🇱", "245": "🇳🇱", "246": "🇳🇱", "247": "🇮🇹", "250": "🇮🇪", "251": "🇮🇸",
        "252": "🇱🇮", "253": "🇱🇺", "254": "🇲🇨", "255": "🇵🇹", "257": "🇳🇴", "258": "🇳🇴", "259": "🇳🇴", "261": "🇵🇱",
        "262": "🇲🇪", "263": "🇵🇹", "264": "🇷🇴", "265": "🇸🇪", "266": "🇸🇪", "267": "🇸🇰", "268": "🇸🇲", "269": "🇨🇭",
        "270": "🇨🇿", "271": "🇹🇷", "272": "🇺🇦", "273": "🇷🇺", "274": "🇲🇰", "275": "🇱🇻", "276": "🇪🇪", "277": "🇱🇹",
        "278": "🇸🇮", "279": "🇷🇸",
        // North / Central America
        "301": "🇦🇮", "303": "🇺🇸", "304": "🇦🇬", "305": "🇦🇬", "306": "🇧🇶", "307": "🇦🇼", "308": "🇧🇸", "309": "🇧🇸",
        "311": "🇧🇸", "310": "🇧🇲", "312": "🇧🇿", "314": "🇧🇧", "316": "🇨🇦", "319": "🇰🇾", "321": "🇨🇷", "323": "🇨🇺",
        "325": "🇩🇲", "327": "🇩🇴", "329": "🇬🇵", "330": "🇬🇩", "331": "🇬🇱", "332": "🇬🇹", "334": "🇭🇳", "336": "🇭🇹",
        "338": "🇺🇸", "366": "🇺🇸", "367": "🇺🇸", "368": "🇺🇸", "369": "🇺🇸", "339": "🇯🇲", "341": "🇰🇳", "343": "🇱🇨",
        "345": "🇲🇽", "347": "🇲🇶", "348": "🇲🇸", "350": "🇳🇮", "351": "🇵🇦", "352": "🇵🇦", "353": "🇵🇦", "354": "🇵🇦",
        "355": "🇵🇦", "356": "🇵🇦", "357": "🇵🇦", "370": "🇵🇦", "371": "🇵🇦", "372": "🇵🇦", "373": "🇵🇦", "358": "🇵🇷",
        "359": "🇸🇻", "361": "🇵🇲", "362": "🇹🇹", "378": "🇻🇬", "379": "🇻🇮",
        // Asia
        "401": "🇦🇫", "405": "🇧🇩", "408": "🇧🇭", "410": "🇧🇹", "412": "🇨🇳", "413": "🇨🇳", "414": "🇨🇳", "416": "🇨🇳",
        "417": "🇨🇰", "418": "🇫🇯", "419": "🇵🇫", "421": "🇮🇳", "423": "🇦🇿", "427": "🇮🇷", "428": "🇮🇶", "431": "🇯🇵",
        "432": "🇯🇵", "434": "🇯🇵", "436": "🇯🇵", "437": "🇰🇷", "438": "🇰🇵", "440": "🇲🇴", "441": "🇲🇾", "443": "🇲🇻",
        "445": "🇲🇺", "447": "🇲🇳", "449": "🇲🇲", "451": "🇳🇵", "453": "🇴🇲", "455": "🇵🇰", "457": "🇵🇭", "459": "🇶🇦",
        "461": "🇸🇦", "463": "🇸🇬", "466": "🇱🇰", "468": "🇸🇾", "470": "🇹🇼", "471": "🇹🇭", "473": "🇹🇱", "475": "🇦🇪",
        "477": "🇻🇳", "478": "🇧🇦",
        // Oceania / SE Asia
        "501": "🇹🇫", "503": "🇦🇺", "506": "🇲🇲", "510": "🇫🇲", "511": "🇵🇼", "512": "🇳🇿", "514": "🇰🇭", 
        "515": "🇰🇭", "518": "🇹🇭", "520": "🇭🇰", "523": "🇱🇦", "525": "🇮🇩", "529": "🇰🇮", "533": "🇲🇾", "536": "🇲🇵", 
        "538": "🇲🇭", "548": "🇵🇭", "553": "🇵🇬", "555": "🇵🇳", "557": "🇸🇧", "559": "🇦🇸", "561": "🇼🇸", "563": "🇸🇬", 
        "564": "🇸🇬", "565": "🇸🇬", "566": "🇸🇬", "567": "🇻🇺", "570": "🇸🇬", "572": "🇹🇺", "574": "🇻🇺", "576": "🇻🇺", 
        "577": "🇻🇺", "578": "🇼🇫",
        // Africa / Atlantic
        "601": "🇿🇦", "603": "🇦🇴", "605": "🇩🇿", "607": "🇹🇫", "608": "🇦🇨", "609": "🇧🇮", "610": "🇧🇯", "611": "🇧🇼", 
        "612": "🇨🇫", "613": "🇨🇲", "615": "🇨🇬", "616": "🇰🇲", "617": "🇨🇻", "618": "🇹🇫", "619": "🇨🇮", "620": "🇨🇬", 
        "621": "🇩🇯", "622": "🇪🇬", "624": "🇪🇹", "625": "🇪🇷", "626": "🇬🇶", "627": "🇬🇦", "629": "🇬🇲", "630": "🇬🇭", 
        "631": "🇬🇳", "632": "🇬🇼", "633": "🇧🇫", "634": "🇰🇪", "635": "🇹🇫", "636": "🇱🇷", "637": "🇱🇷", "642": "🇱🇾", 
        "644": "🇱🇸", "645": "🇲🇺", "647": "🇲🇬", "649": "🇲🇱", "650": "🇲🇿", "654": "🇲🇷", "655": "🇳🇪", "656": "🇳🇬", 
        "657": "🇷🇼", "659": "🇸🇳", "660": "🇸🇨", "661": "🇸🇱", "662": "🇸🇴", "663": "🇸🇩", "664": "🇸🇿", "665": "🇹🇿", 
        "666": "🇹🇬", "667": "🇹🇳", "668": "🇺🇬", "669": "🇨🇩", "670": "🇿🇲", "671": "🇿🇼", "672": "🇳🇦", "674": "🇹🇿", 
        "675": "🇪🇹", "676": "🇸🇴", "677": "🇹🇿", "678": "🇸🇹", "679": "🇨🇮",
        // South America
        "701": "🇦🇷", "710": "🇧🇷", "720": "🇧🇴", "725": "🇨🇱", "730": "🇨🇴", "735": "🇪🇨", "740": "🇫🇰", "745": "🇬🇾",
        "750": "🇵🇾", "755": "🇵🇪", "760": "🇸🇷", "765": "🇺🇾", "770": "🇻🇪"
    };

    if (midToEmoji[mid]) emoji = midToEmoji[mid];
    else if (!mmsiStr) emoji = '🏳️';

    if (countryCode && typeof countryCode === 'string' && countryCode.length === 2 && countryCode !== "00") {
        const code = countryCode.toLowerCase();
        return `<span style="display: inline-flex; align-items: center;">
            <img src="https://flagcdn.com/w80/${code}.png" 
                 alt="${countryCode}" 
                 style="height: 1.4em; width: auto; vertical-align: middle; border-radius: 2px; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" 
                 onerror="this.style.display='none'; this.nextSibling.style.display='inline';" 
            /><span style="display: none;">${emoji}</span>
        </span>`;
    }
    return emoji;
}
