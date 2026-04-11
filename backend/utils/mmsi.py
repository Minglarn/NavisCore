"""MMSI to country code mapping. Comprehensive list from ITU/Wikipedia."""

# Comprehensive MID to ISO-2 mapping
MID_MAP = {
    "201": "al", "202": "ad", "203": "at", "204": "pt", "205": "be", "206": "by", "207": "bg", "208": "va",
    "209": "cy", "210": "cy", "211": "de", "212": "cy", "213": "ge", "214": "md", "215": "mt", "218": "de",
    "219": "dk", "220": "dk", "224": "es", "225": "es", "226": "fr", "227": "fr", "228": "fr", "229": "mt",
    "230": "fi", "231": "fo", "232": "gb", "233": "gb", "234": "gb", "235": "gb", "236": "gi", "237": "gr",
    "238": "gr", "239": "gr", "240": "gr", "241": "gr", "242": "ma", "243": "hu", "244": "nl", "245": "nl",
    "246": "nl", "247": "it", "248": "mt", "249": "mt", "250": "ie", "251": "is", "252": "mc", "253": "lu",
    "254": "mc", "255": "pt", "256": "mt", "257": "no", "258": "no", "259": "no", "261": "pl", "262": "me",
    "263": "pt", "264": "ro", "265": "se", "266": "se", "267": "sk", "268": "sm", "269": "ch", "270": "cz",
    "271": "tr", "272": "ua", "273": "ru", "274": "lt", "275": "lv", "276": "ee", "277": "lt", "278": "si",
    "279": "rs", "301": "ai", "303": "us", "304": "ag", "305": "ag", "306": "bq", "307": "aw", "308": "bs",
    "309": "bs", "310": "bm", "311": "bs", "312": "bz", "314": "bb", "316": "ca", "319": "ky", "321": "cr",
    "323": "cu", "325": "dm", "327": "do", "329": "gp", "330": "gd", "331": "gl", "332": "gt", "334": "hn",
    "336": "ht", "338": "us", "339": "jm", "341": "kn", "343": "lc", "345": "mx", "347": "mq", "348": "ms",
    "350": "ni", "351": "pa", "352": "pa", "353": "pa", "354": "pa", "355": "pa", "356": "pa", "357": "pa",
    "358": "pr", "359": "sv", "361": "pm", "362": "tt", "364": "tc", "366": "us", "367": "us", "368": "us",
    "369": "us", "370": "pa", "371": "pa", "372": "pa", "373": "pa", "374": "pa", "375": "vc", "376": "vc",
    "377": "vc", "378": "vg", "379": "vi", "401": "af", "403": "sa", "405": "bd", "408": "bh", "410": "bt",
    "412": "cn", "413": "cn", "414": "cn", "416": "tw", "417": "lk", "419": "in", "422": "ir", "423": "az",
    "425": "iq", "428": "il", "431": "jp", "432": "jp", "434": "tm", "436": "uz", "437": "uz", "438": "jo",
    "440": "kr", "441": "kr", "443": "ps", "445": "kp", "447": "kw", "450": "lb", "451": "kg", "453": "mo",
    "455": "mv", "457": "mn", "459": "np", "461": "om", "463": "pk", "466": "qa", "468": "sy", "470": "ae",
    "471": "ae", "472": "tj", "473": "ye", "475": "ye", "477": "hk", "478": "ba", "501": "tf", "503": "au",
    "506": "mm", "508": "bn", "510": "fm", "512": "fj", "514": "cx", "515": "cc", "516": "ck", "518": "sb",
    "520": "gu", "523": "id", "525": "id", "529": "ki", "531": "la", "533": "my", "536": "mp", "538": "mh",
    "540": "nc", "542": "nu", "544": "nr", "546": "pf", "548": "ph", "550": "tl", "553": "pg", "555": "pn",
    "557": "sb", "559": "as", "561": "ws", "563": "sg", "564": "sg", "565": "sg", "566": "sg", "567": "th",
    "570": "to", "572": "tv", "574": "vn", "576": "vu", "577": "vu", "578": "wf", "601": "za", "603": "ao",
    "605": "dz", "607": "sh", "608": "ac", "609": "bi", "610": "bj", "611": "bw", "612": "cf", "613": "cm",
    "615": "cg", "616": "km", "617": "cv", "618": "tf", "619": "ci", "620": "km", "621": "dj", "622": "eg",
    "624": "et", "625": "er", "626": "ga", "627": "gh", "629": "gm", "630": "gw", "631": "gq", "632": "gn",
    "633": "bf", "634": "ke", "635": "tf", "636": "lr", "637": "lr", "638": "lr", "642": "ly", "644": "ls",
    "645": "mu", "647": "mg", "649": "ml", "650": "mr", "654": "mw", "655": "mz", "656": "ne", "657": "ng",
    "659": "na", "660": "re", "661": "rw", "662": "sn", "663": "sc", "664": "sl", "665": "so", "666": "sd",
    "667": "sz", "668": "st", "669": "tf", "670": "td", "671": "tg", "672": "tn", "674": "tz", "675": "ug",
    "676": "cd", "677": "tz", "678": "zm", "679": "zw", "701": "ar", "710": "br", "720": "cl", "725": "co",
    "730": "ec", "735": "fk", "740": "gf", "745": "gy", "750": "py", "755": "pe", "760": "sr", "765": "gs",
    "770": "uy", "775": "ve"
}

def get_country_code_from_mmsi(mmsi_str: str) -> str:
    if not mmsi_str or len(mmsi_str) < 3: return None
    mid = mmsi_str[:3]
    return MID_MAP.get(mid)

COUNTRY_NAMES = {
    "ac": "Ascension", "ad": "Andorra", "ae": "United Arab Emirates", "af": "Afghanistan", "ag": "Antigua and Barbuda",
    "ai": "Anguilla", "al": "Albania", "am": "Armenia", "ao": "Angola", "ar": "Argentina", "as": "American Samoa",
    "at": "Austria", "au": "Australia", "aw": "Aruba", "az": "Azerbaijan", "ba": "Bosnia and Herzegovina",
    "bb": "Barbados", "bd": "Bangladesh", "be": "Belgium", "bf": "Burkina Faso", "bg": "Bulgaria", "bh": "Bahrain",
    "bi": "Burundi", "bj": "Benin", "bm": "Bermuda", "bn": "Brunei", "bq": "Curaçao", "br": "Brazil", "bs": "Bahamas",
    "bt": "Bhutan", "bw": "Botswana", "by": "Belarus", "bz": "Belize", "ca": "Canada", "cc": "Cocos Islands",
    "cd": "DR Congo", "cf": "Central African Republic", "cg": "Congo", "ch": "Switzerland", "ci": "Côte d'Ivoire",
    "ck": "Cook Islands", "cl": "Chile", "cm": "Cameroon", "cn": "China", "co": "Colombia", "cr": "Costa Rica",
    "cu": "Cuba", "cv": "Cabo Verde", "cx": "Christmas Island", "cy": "Cyprus", "cz": "Czech Republic",
    "de": "Germany", "dj": "Djibouti", "dm": "Dominica", "do": "Dominican Republic", "dz": "Algeria",
    "ec": "Ecuador", "ee": "Estonia", "eg": "Egypt", "er": "Eritrea", "es": "Spain", "et": "Ethiopia",
    "fi": "Finland", "fj": "Fiji", "fk": "Falkland Islands", "fm": "Micronesia", "fo": "Faroe Islands", "fr": "France",
    "ga": "Gabon", "gb": "United Kingdom", "gd": "Grenada", "ge": "Georgia", "gf": "French Guiana", "gh": "Ghana",
    "gi": "Gibraltar", "gl": "Greenland", "gm": "Gambia", "gn": "Guinea", "gp": "Guadeloupe", "gq": "Equatorial Guinea",
    "gr": "Greece", "gs": "South Georgia", "gt": "Guatemala", "gu": "Guam", "gw": "Guinea-Bissau", "gy": "Guyana",
    "hk": "Hong Kong", "hn": "Honduras", "ht": "Haiti", "hu": "Hungary", "id": "Indonesia", "ie": "Ireland",
    "il": "Israel", "in": "India", "iq": "Iraq", "ir": "Iran", "is": "Iceland", "it": "Italy", "jm": "Jamaica",
    "jo": "Jordan", "jp": "Japan", "ke": "Kenya", "kg": "Kyrgyzstan", "ki": "Kiribati", "km": "Comoros",
    "kn": "Saint Kitts and Nevis", "kp": "North Korea", "kr": "South Korea", "kw": "Kuwait", "ky": "Cayman Islands",
    "la": "Laos", "lb": "Lebanon", "lc": "Saint Lucia", "lk": "Sri Lanka", "lr": "Liberia", "ls": "Lesotho",
    "lt": "Lithuania", "lu": "Luxembourg", "lv": "Latvia", "ly": "Libya", "ma": "Morocco", "mc": "Monaco",
    "md": "Moldova", "me": "Montenegro", "mg": "Madagascar", "mh": "Marshall Islands", "ml": "Mali", "mm": "Myanmar",
    "mn": "Mongolia", "mo": "Macao", "mp": "Northern Mariana Islands", "mq": "Martinique", "mr": "Mauritania",
    "ms": "Montserrat", "mt": "Malta", "mu": "Mauritius", "mv": "Maldives", "mw": "Malawi", "mx": "Mexico",
    "my": "Malaysia", "mz": "Mozambican", "na": "Namibian", "nc": "New Caledonia", "ne": "Niger", "ng": "Nigeria",
    "ni": "Nicaragua", "nl": "Netherlands", "no": "Norway", "np": "Nepal", "nr": "Nauru", "nu": "Niue",
    "om": "Oman", "pa": "Panama", "pe": "Peru", "pf": "French Polynesia", "pg": "Papua New Guinea", "ph": "Philippines",
    "pk": "Pakistan", "pl": "Poland", "pm": "Saint Pierre and Miquelon", "pn": "Pitcairn", "pr": "Puerto Rico",
    "ps": "Palestine", "pt": "Portugal", "py": "Paraguay", "qa": "Qatar", "re": "Reunion", "ro": "Romania",
    "rs": "Serbia", "ru": "Russia", "rw": "Rwanda", "sa": "Saudi Arabia", "sb": "Solomon Islands", "sc": "Seychelles",
    "sd": "Sudan", "se": "Sweden", "sg": "Singapore", "sh": "Saint Helena", "si": "Slovenia", "sk": "Slovakia",
    "sl": "Sierra Leone", "sm": "San Marino", "sn": "Senegal", "so": "Somalia", "sr": "Suriname",
    "st": "Sao Tome and Principe", "sv": "El Salvador", "sy": "Syria", "sz": "Eswatini", "tc": "Turks and Caicos",
    "td": "Chad", "tf": "French Southern Territories", "tg": "Togo", "th": "Thailand", "tj": "Tajikistan",
    "tl": "Timorese", "tm": "Turkmenistan", "tn": "Tunisia", "to": "Tonga", "tr": "Turkey", "tt": "Trinidad and Tobago",
    "tv": "Tuvalu", "tw": "Taiwan", "tz": "Tanzania", "ua": "Ukraine", "ug": "Uganda", "us": "USA", "uy": "Uruguay",
    "uz": "Uzbekistan", "va": "Vatican City", "vc": "Saint Vincent and the Grenadines", "ve": "Venezuela",
    "vg": "British Virgin Islands", "vi": "US Virgin Islands", "vn": "Vietnam", "vu": "Vanuatu",
    "wf": "Wallis and Futuna", "ws": "Samoa", "ye": "Yemen", "za": "South Africa", "zm": "Zambia", "zw": "Zimbabwe"
}

COUNTRY_ADJECTIVES = {
    "ac": "Ascension", "ad": "Andorran", "ae": "Emirati", "af": "Afghan", "ag": "Antiguan", "ai": "Anguillan",
    "al": "Albanian", "am": "Armenian", "ao": "Angolan", "ar": "Argentine", "as": "American Samoan", "at": "Austrian",
    "au": "Australian", "aw": "Aruban", "az": "Azerbaijani", "ba": "Bosnian", "bb": "Barbadian", "bd": "Bangladeshi",
    "be": "Belgian", "bf": "Burkinabé", "bg": "Bulgarian", "bh": "Bahraini", "bi": "Burundian", "bj": "Beninese",
    "bm": "Bermudian", "bn": "Bruneian", "bq": "Curaçaoan", "br": "Brazilian", "bs": "Bahamian", "bt": "Bhutanese",
    "bw": "Botswanan", "by": "Belarusian", "bz": "Belizean", "ca": "Canadian", "cc": "Cocos Islander", "cd": "Congolese",
    "cf": "Central African", "cg": "Congolese", "ch": "Swiss", "ci": "Ivorian", "ck": "Cook Islander", "cl": "Chilean",
    "cm": "Cameroonian", "cn": "Chinese", "co": "Colombian", "cr": "Costa Rican", "cu": "Cuban", "cv": "Cabo Verdean",
    "cx": "Christmas Islander", "cy": "Cypriot", "cz": "Czech", "de": "German", "dj": "Djiboutian", "dm": "Dominican",
    "do": "Dominican", "dz": "Algerian", "ec": "Ecuadorean", "ee": "Estonian", "eg": "Egyptian", "er": "Eritrean",
    "es": "Spanish", "et": "Ethiopian", "fi": "Finnish", "fj": "Fijian", "fk": "Falkland Islander", "fm": "Micronesian",
    "fo": "Faroese", "fr": "French", "ga": "Gabonese", "gb": "British", "gd": "Grenadian", "ge": "Georgian",
    "gf": "French Guianese", "gh": "Ghanaian", "gi": "Gibraltarian", "gl": "Greenlandic", "gm": "Gambian",
    "gn": "Guinean", "gp": "Guadeloupean", "gq": "Equatorial Guinean", "gr": "Greek", "gs": "South Georgian",
    "gt": "Guatemalan", "gu": "Guamanian", "gw": "Bissau-Guinean", "gy": "Guyanese", "hk": "Hong Kong",
    "hn": "Honduran", "ht": "Haitian", "hu": "Hungarian", "id": "Indonesian", "ie": "Irish", "il": "Israeli",
    "in": "Indian", "iq": "Iraqi", "ir": "Iranian", "is": "Icelandic", "it": "Italian", "jm": "Jamaican",
    "jo": "Jordanian", "jp": "Japanese", "ke": "Kenyan", "kg": "Kyrgyz", "ki": "Kiribati", "km": "Comoran",
    "kn": "Kittitian", "kp": "North Korean", "kr": "South Korean", "kw": "Kuwaiti", "ky": "Caymanian", "la": "Lao",
    "lb": "Lebanese", "lc": "Saint Lucian", "lk": "Sri Lankan", "lr": "Liberian", "ls": "Lesotho", "lt": "Lithuanian",
    "lu": "Luxembourg", "lv": "Latvia", "ly": "Libya", "ma": "Moroccan", "mc": "Monegasque", "md": "Moldovan",
    "me": "Montenegrin", "mg": "Malagasy", "mh": "Marshallese", "ml": "Malian", "mm": "Burmese", "mn": "Mongolian",
    "mo": "Macanese", "mp": "Northern Marianan", "mq": "Martinican", "mr": "Mauritanian", "ms": "Montserratian",
    "mt": "Maltese", "mu": "Mauritian", "mv": "Maldivian", "mw": "Malawian", "mx": "Mexican", "my": "Malaysian",
    "mz": "Mozambican", "na": "Namibian", "nc": "New Caledonian", "ne": "Nigerien", "ng": "Nigerian", "ni": "Nicaraguan",
    "nl": "Dutch", "no": "Norwegian", "np": "Nepalese", "nr": "Nauruan", "nu": "Niuean", "om": "Omani", "pa": "Panamanian",
    "pe": "Peruvian", "pf": "French Polynesian", "pg": "Papua New Guinean", "ph": "Philippine", "pk": "Pakistani",
    "pl": "Polish", "pm": "Saint-Pierrais", "pn": "Pitcairn Islander", "pr": "Puerto Rican", "ps": "Palestinian",
    "pt": "Portuguese", "py": "Paraguayan", "qa": "Qatari", "re": "Reunionese", "ro": "Romanian", "rs": "Serbian",
    "ru": "Russian", "rw": "Rwandan", "sa": "Saudi", "sb": "Solomon Islander", "sc": "Seychellois", "sd": "Sudanese",
    "se": "Swedish", "sg": "Singaporean", "sh": "Saint Helenian", "si": "Slovenian", "sk": "Slovak", "sl": "Sierra Leonean",
    "sm": "San Marinese", "sn": "Senegalese", "so": "Somali", "sr": "Surinamese", "st": "Santomean", "sv": "Salvadoran",
    "sy": "Syrian", "sz": "Swazi", "tc": "Turks and Caicos", "td": "Chadian", "tf": "French", "tg": "Togolese",
    "th": "Thai", "tj": "Tajik", "tl": "Timorese", "tm": "Turkmen", "tn": "Tunisian", "to": "Tongan", "tr": "Turkish",
    "tt": "Trinidadian", "tv": "Tuvaluan", "tw": "Taiwanese", "tz": "Tanzanian", "ua": "Ukrainian", "ug": "Ugandan",
    "us": "American", "uy": "Uruguayan", "uz": "Uzbek", "va": "Vatican", "vc": "Vincentian", "ve": "Venezuelan",
    "vg": "British Virgin Islander", "vi": "US Virgin Islander", "vn": "Vietnamese", "vu": "Vanuatu",
    "wf": "Wallis and Futuna", "ws": "Samoan", "ye": "Yemen", "za": "South African", "zm": "Zambian", "zw": "Zimbabwean"
}

def get_country_adjective(code: str) -> str:
    if not code: return "unknown"
    return COUNTRY_ADJECTIVES.get(code.lower(), "unknown")

def get_country_name(code: str) -> str:
    if not code: return "unknown"
    return COUNTRY_NAMES.get(code.lower(), "unknown")
