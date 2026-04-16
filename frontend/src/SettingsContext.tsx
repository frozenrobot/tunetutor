import { createContext, useState, useContext, useEffect, ReactNode } from 'react';

export type ReadingFormat = 'hiragana' | 'katakana' | 'romaji';

interface SettingsContextType {
    readingFormat: ReadingFormat;
    setReadingFormat: (format: ReadingFormat) => void;
}

export const SettingsContext = createContext<SettingsContextType>({
    readingFormat: 'hiragana',
    setReadingFormat: () => {},
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const [readingFormat, setReadingFormat] = useState<ReadingFormat>('hiragana');

    useEffect(() => {
        const saved = localStorage.getItem('lyvo_reading_format');
        if (saved) setReadingFormat(saved as any);
    }, []);

    useEffect(() => {
        localStorage.setItem('lyvo_reading_format', readingFormat);
    }, [readingFormat]);

    return (
        <SettingsContext.Provider value={{ readingFormat, setReadingFormat }}>
            {children}
        </SettingsContext.Provider>
    );
};

// Utility: convert hiragana string to katakana
export const hiraganaToKatakana = (str: string): string => {
    if (!str) return '';
    return str.replace(/[\u3041-\u3096]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
};

// Utility: convert katakana string to hiragana
export const katakanaToHiragana = (str: string): string => {
    if (!str) return '';
    return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
};

// Utility: convert hiragana/katakana to romaji
const ROMAJI_MAP: Record<string, string> = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'di','づ':'du','で':'de','ど':'do',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
    'っ':'', // handled specially
    'ー':'-',
};

export const kanaToRomaji = (str: string): string => {
    if (!str) return '';
    // First convert any katakana to hiragana for uniform lookup
    const hira = str.replace(/[\u30A1-\u30F6]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
    let result = '';
    let i = 0;
    while (i < hira.length) {
        // Check for っ (geminate)
        if (hira[i] === 'っ' && i + 1 < hira.length) {
            // Double the next consonant
            const nextTwo = hira.substring(i + 1, i + 3);
            const nextOne = hira.substring(i + 1, i + 2);
            const mapped = ROMAJI_MAP[nextTwo] || ROMAJI_MAP[nextOne];
            if (mapped && mapped.length > 0) {
                result += mapped[0]; // double the first consonant
            }
            i++;
            continue;
        }
        // Try two-char combo first (for きゃ etc.)
        if (i + 1 < hira.length) {
            const pair = hira.substring(i, i + 2);
            if (ROMAJI_MAP[pair]) {
                result += ROMAJI_MAP[pair];
                i += 2;
                continue;
            }
        }
        // Single char
        if (ROMAJI_MAP[hira[i]]) {
            result += ROMAJI_MAP[hira[i]];
        } else {
            result += hira[i]; // pass through unknown chars
        }
        i++;
    }
    return result;
};
