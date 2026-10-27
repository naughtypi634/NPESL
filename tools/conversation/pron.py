#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pronunciation marks for Conversation Starters story text.

Three marks, rendered inline so a learner can see them while reading:

    连读    take‿it / see‿ʲit     C + V linking, or a j/w glide
    省略    nex(t) day / bu(t) the   final /t/ or /d/ before a consonant
    变音    water  wa-der          flap T, assimilation, weak forms

Sense-group bars (意群) are still computed but only emitted when
``annotate(..., thought_groups=True)``; the site plays whole sentences per tap.

The rules are deliberately conservative: they only mark patterns that are
safe to teach without a pronunciation dictionary.  ``annotate()`` returns
HTML for display; the caller keeps the untouched sentence for ``data-text``
and for the audio hash.
"""
from __future__ import annotations

import html
import re

WORD_RE = re.compile(
    r"[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*['’]?"
)

CONSONANT_LETTERS = set("bcdfgklmnprstvxzq")

# Words whose final -e is a vowel, not a silent-e consonant ending.
VOWEL_E_WORDS = {
    "be", "he", "she", "we", "me", "the", "ye",
    "maybe", "recipe", "acme", "apostrophe", "epitome", "catastrophe",
    "cafe", "fiance", "genre", "simile", "facsimile", "hyperbole",
    "guacamole", "ukulele", "coyote", "karate", "saute", "sauté", "forte",
}

# Words that start with a vowel letter but a /j/ or /w/ sound.
CONSONANT_U_WORDS = {
    "use", "used", "uses", "using", "useful", "useless", "user", "users",
    "usual", "usually", "unique", "unit", "units", "unite", "united",
    "universe", "universal", "university", "uniform", "union", "unison",
    "unanimous", "unicorn", "unicycle", "unify", "unity", "utility",
    "utensil", "utopia", "europe", "european", "euro", "eulogy",
    "euphemism", "euphoria", "ewe", "ukulele", "ubiquitous", "ufo", "url",
    "one", "once", "oneself", "ouija",
}

# Words that start with h but a vowel sound.
H_VOWEL_WORDS = {
    "hour", "hours", "hourly", "honest", "honestly", "honesty",
    "honor", "honors", "honored", "honorable", "honorary", "heir",
    "heirs", "heirloom", "herb", "herbs", "herbal",
}

# Words whose written final t is silent.
SILENT_FINAL_T_WORDS = {
    "ballet", "beret", "valet", "bouquet", "debut", "ricochet",
    "parquet", "sorbet", "tarot", "buffet", "filet", "gourmet",
    "chalet", "bidet", "cabaret",
}

# Words ending in -te/-de whose final vowel is pronounced, so the t/d is not
# a dropped consonant.
SILENT_E_TD_EXCEPTIONS = {
    "coyote", "karate", "saute", "sauté", "forte", "recipe", "apostrophe",
    "epitome", "acme", "maybe", "cafe", "fiance", "genre", "simile",
    "facsimile", "hyperbole", "guacamole", "ukulele",
}

# Words ending in -ed that are not a past-tense suffix; their final d is real.
TD_ED_WORDS = {
    "need", "feed", "seed", "weed", "speed", "bed", "red", "shed", "sled",
    "wed", "led", "fed", "dead", "head", "bread", "read", "spread",
    "thread", "instead", "ahead", "overhead", "forehead", "redhead",
    "hundred",
}

# Two- and three-word chunks with a fixed connected-speech pronunciation.
PHRASES = [
    (("what", "are", "you"), "whatcha"),
    (("a", "couple", "of"), "a coupla"),
    (("a", "lot", "of"), "a lotta"),
    (("not", "at", "all"), "nod ad all"),
    (("did", "you"), "didja"),
    (("do", "you"), "d'ya"),
    (("would", "you"), "wouldja"),
    (("could", "you"), "couldja"),
    (("should", "you"), "shouldja"),
    (("don't", "you"), "doncha"),
    (("didn't", "you"), "didncha"),
    (("doesn't", "you"), "doesncha"),
    (("won't", "you"), "woncha"),
    (("can't", "you"), "cancha"),
    (("aren't", "you"), "arencha"),
    (("get", "you"), "getcha"),
    (("got", "you"), "gotcha"),
    (("let", "you"), "letcha"),
    (("bet", "you"), "betcha"),
    (("what", "you"), "whatcha"),
    (("that", "you"), "thatcha"),
    (("but", "you"), "butcha"),
    (("need", "you"), "needja"),
    (("made", "you"), "madeja"),
    (("had", "you"), "hadja"),
    (("told", "you"), "toldja"),
    (("miss", "you"), "mish you"),
    (("this", "year"), "thish year"),
    (("as", "you"), "azhu"),
    (("because", "you"), "becuzhu"),
    (("use", "your"), "uzhur"),
    (("out", "of"), "outta"),
    (("give", "me"), "gimme"),
    (("let", "me"), "lemme"),
    (("tell", "them"), "tell'em"),
    (("want", "to"), "wanna"),
    (("have", "to"), "hafta"),
    (("has", "to"), "hasta"),
    (("had", "to"), "hadda"),
    (("ought", "to"), "oughta"),
    (("used", "to"), "usta"),
    (("supposed", "to"), "sposta"),
    (("get", "it"), "geddit"),
    (("got", "it"), "goddit"),
    (("put", "it"), "pudit"),
    (("let", "it"), "ledit"),
    (("but", "it"), "budit"),
    (("at", "all"), "adall"),
    (("at", "it"), "adit"),
    (("get", "up"), "geddup"),
    (("right", "away"), "righ-daway"),
    (("what", "about"), "whad about"),
    (("that", "i"), "thad I"),
    (("but", "i"), "bud I"),
]

# "going to" / "got to" are only reductions before a verb.
VERB_BASES = {
    "go", "be", "do", "have", "get", "make", "take", "see", "eat", "call",
    "buy", "tell", "ask", "try", "stop", "start", "feel", "come", "leave",
    "stay", "sleep", "study", "play", "watch", "read", "write", "meet",
    "help", "visit", "travel", "move", "change", "find", "give", "put",
    "run", "walk", "swim", "cook", "clean", "wash", "wait", "talk", "say",
    "think", "know", "want", "need", "like", "love", "miss", "remember",
    "forget", "send", "bring", "pay", "sell", "open", "close", "finish",
    "begin", "learn", "teach", "practice", "relax", "rest", "smile",
    "laugh", "cry", "wake", "wear", "drive", "ride", "fly", "arrive",
    "return", "happen", "become", "keep", "show", "use", "spend", "save",
    "build", "break", "fix", "check", "pick", "drop", "carry", "turn",
}

IRREGULAR_FINITE = """
am is are was were be been being have has had do does did done can could
will would shall should may might must ought went came saw said told thought
knew found gave made took got became left kept held stood sat ran ate drank
wrote read heard felt brought bought caught taught sent spent built broke
chose drove fell flew forgot met paid rode sold sang spoke swam wore won
""".split()

CONTRACTIONS = """
i'm you're he's she's it's we're they're i've you've we've they've i'd
you'd he'd she'd it'd we'd they'd i'll you'll he'll she'll it'll we'll
they'll isn't aren't wasn't weren't hasn't haven't hadn't didn't doesn't
don't can't couldn't won't wouldn't shouldn't mustn't needn't let's
that's there's here's what's who's where's when's why's how's
""".split()

FINITE_VERBS = set(IRREGULAR_FINITE) | set(CONTRACTIONS) | set(VERB_BASES)
for _base in VERB_BASES:
    FINITE_VERBS.add(_base + "s")
    FINITE_VERBS.add(_base + "es")
    FINITE_VERBS.add(_base + "ed")
    if _base.endswith("e"):
        FINITE_VERBS.add(_base + "d")
    if _base.endswith("y"):
        FINITE_VERBS.add(_base[:-1] + "ies")
        FINITE_VERBS.add(_base[:-1] + "ied")
    if (len(_base) > 2 and _base[-1] not in "aeiou"
            and _base[-2] in "aeiou" and _base[-3] not in "aeiou"):
        FINITE_VERBS.add(_base + _base[-1] + "ed")

UNAMBIGUOUS_FINITE = set(IRREGULAR_FINITE) | set(CONTRACTIONS) | {
    "am", "is", "are", "was", "were", "be", "been", "have", "has", "had",
    "do", "does", "did", "can", "could", "will", "would", "shall",
    "should", "may", "might", "must", "ought",
}

DETERMINERS = {
    "the", "a", "an", "this", "that", "these", "those", "my", "your",
    "his", "her", "its", "our", "their", "some", "any", "no", "every",
    "each", "both", "all", "another", "other", "either", "neither",
    "much", "many", "few", "little", "several", "enough",
}

ADJECTIVES = {
    "big", "small", "large", "little", "old", "young", "new", "tall",
    "short", "long", "kind", "nice", "quiet", "loud", "red", "blue",
    "green", "black", "white", "dark", "light", "warm", "cool", "hot",
    "cold", "wet", "dry", "clean", "dirty", "busy", "free", "full",
    "empty", "open", "closed", "happy", "sad", "tired", "hungry",
    "thirsty", "beautiful", "pretty", "handsome", "ugly", "expensive",
    "cheap", "comfortable", "important", "interesting", "different",
    "favorite", "delicious", "wonderful", "amazing", "excellent",
    "perfect", "special", "simple", "easy", "hard", "soft", "strong",
    "weak", "rich", "poor", "safe", "dangerous", "healthy", "sick",
    "smart", "clever", "funny", "boring", "exciting", "confusing",
    "surprising", "relaxing", "annoying", "great", "terrible", "awful",
    "horrible", "lovely", "friendly", "lonely", "close", "dark",
}

SUBJECT_PRONOUNS = {"i", "you", "he", "she", "it", "we", "they"}
INDEFINITE_PRONOUNS = {
    "everybody", "everyone", "somebody", "someone", "nobody",
    "something", "anything", "everything", "nothing",
    "all", "both", "none", "each", "either", "neither",
    "some", "any", "many", "few", "several", "enough", "most",
}

COMMON_PAST = {
    "walked", "talked", "played", "watched", "looked", "helped",
    "worked", "cooked", "cleaned", "washed", "waited", "stayed",
    "visited", "moved", "changed", "finished", "started", "stopped",
    "tried", "called", "asked", "answered", "smiled", "laughed",
    "cried", "listened", "danced", "jumped", "climbed", "carried",
    "turned", "arrived", "returned", "happened", "remembered",
    "practiced", "relaxed", "travelled", "traveled", "studied",
    "learned", "used", "needed", "wanted", "liked", "loved",
    "missed", "opened",
}
PREPOSITIONS = {
    "about", "above", "across", "after", "against", "along", "among",
    "around", "at", "before", "behind", "below", "beside", "between",
    "by", "down", "during", "for", "from", "in", "inside", "into",
    "near", "of", "off", "on", "onto", "out", "outside", "over",
    "past", "through", "to", "toward", "under", "until", "up",
    "with", "without",
}
ADVERBS = {
    "again", "ago", "almost", "already", "also", "always", "anyway",
    "away", "back", "barely", "carefully", "certainly", "clearly",
    "easily", "else", "especially", "even", "eventually", "ever",
    "finally", "first", "forward", "hardly", "here", "however",
    "instead", "just", "later", "maybe", "mostly", "never", "now",
    "often", "once", "only", "perhaps", "probably", "quickly",
    "quietly", "rarely", "really", "right", "simply", "slowly",
    "sometimes", "soon", "still", "suddenly", "then", "there",
    "together", "too", "usually", "well", "yet",
}
COORD = {"and", "but", "so", "or", "yet", "nor"}
SUBORD = {
    "because", "when", "while", "if", "although", "though", "since",
    "until", "unless", "before", "after", "whenever", "wherever",
    "whereas", "whether", "once",
}
RELATIVE = {"who", "whom", "whose", "which", "where", "when"}
DISCOURSE_WORDS = {
    "however", "therefore", "moreover", "furthermore", "nevertheless",
    "otherwise", "instead", "meanwhile", "finally", "eventually",
    "suddenly", "luckily", "unfortunately", "honestly", "actually",
    "basically", "obviously", "clearly", "yes", "no", "well", "okay",
    "oh", "ah", "then", "later", "now", "today", "yesterday",
    "tomorrow", "sometimes", "usually", "often", "always", "never",
    "maybe", "perhaps", "probably", "certainly", "first", "finally",
}
DISCOURSE_PHRASES = [
    ("for", "example"), ("for", "instance"), ("in", "fact"),
    ("in", "other", "words"), ("in", "the", "end"),
    ("in", "the", "meantime"), ("in", "the", "beginning"),
    ("in", "the", "past"), ("in", "the", "future"), ("in", "short"),
    ("in", "brief"), ("in", "general"), ("in", "conclusion"),
    ("in", "addition"), ("on", "the", "other", "hand"),
    ("on", "the", "contrary"), ("on", "the", "whole"),
    ("as", "a", "result"), ("of", "course"), ("after", "all"),
    ("at", "first"), ("at", "last"), ("at", "least"),
    ("at", "the", "same", "time"), ("by", "the", "way"),
    ("as", "usual"), ("as", "always"), ("these", "days"),
]
COORD_GATE = (
    SUBJECT_PRONOUNS | INDEFINITE_PRONOUNS | VERB_BASES | COMMON_PAST
    | set(IRREGULAR_FINITE) | PREPOSITIONS | ADVERBS | SUBORD
    | {"not", "no", "so"}
)
THAT_GUARDS = {
    "so", "such", "now", "given", "provided", "assuming", "considering",
    "in", "except",
}
SUBORD_GUARDS = {
    "that": THAT_GUARDS,
    "if": {"even", "only", "just", "as"},
    "though": {"even", "as"},
    "when": {"even", "only", "since"},
    "because": {"just", "only", "simply"},
    "while": {"worth"},
    "since": {"ever"},
}

# Common words where a single t between vowels is flapped in American English.
FLAP_WORDS = {
    "water": "wa-der", "better": "be-der", "letter": "le-der",
    "little": "li-dle", "city": "ci-dy", "pretty": "pre-dy",
    "party": "par-dy", "later": "la-der", "matter": "ma-der",
    "butter": "bu-der", "computer": "compu-der", "daughter": "dau-der",
    "getting": "ge-ding", "sitting": "si-ding", "waiting": "wai-ding",
    "meeting": "mee-ding", "eating": "ea-ding", "writing": "wri-ding",
    "fighting": "fi-ding", "painting": "pain-ding", "writer": "wri-der",
    "thirty": "thir-dy", "forty": "for-dy", "fifty": "fif-dy",
    "sixty": "six-dy", "seventy": "seven-dy", "eighty": "eigh-dy",
    "ninety": "nine-dy",
}

# Whole-word reductions and weak forms, mark the word with a respelling.
WEAK_FORMS = {
    "every": "ev'ry", "chocolate": "choc'late",
    "vegetable": "veg'table", "interesting": "int'resting",
    "different": "diff'rent", "favorite": "fav'rite", "camera": "cam'ra",
    "business": "biz'ness", "comfortable": "comf'table",
    "restaurant": "res'taurant", "temperature": "temp'ature",
    "probably": "prob'ly", "library": "lib'ry", "February": "Feb'ruary",
    "Wednesday": "Wenz-day", "memory": "mem'ry", "history": "his'try",
    "evening": "ev'ning", "button": "bu'on", "cotton": "co'on",
    "certain": "cer'in", "curtain": "cur'in", "kitten": "ki'en",
    "eaten": "ea'en", "written": "wri'en", "mountain": "moun'in",
    "fountain": "foun'in", "sentence": "sen'ence",
    "interview": "in'erview", "internet": "in'ernet",
    "twenty": "twenny", "winter": "winner", "center": "cenner",
    "dentist": "dennist", "plenty": "plenny", "gentle": "gennle",
    "romantic": "roman'ic", "advantage": "advan'age",
    "wanted": "wannid", "counted": "counnid", "printed": "prinnid",
    "painted": "painnid",
}

GLIDE_J_WORDS = {
    "i", "eye", "hi", "ski", "spaghetti", "sushi", "taxi", "chili",
    "kiwi", "alumni", "stimuli", "be", "he", "she", "we", "me",
}
GLIDE_W_WORDS = {
    "go", "do", "to", "two", "who", "you", "how", "now", "know",
    "show", "new", "too", "blue", "true", "through", "though",
    "although", "so", "no", "menu", "value", "issue", "tissue",
    "continue", "argue", "venue", "rescue", "statue", "virtue",
    "clue", "glue", "due", "pursue", "queue", "hue", "cue", "sue",
    "tofu", "flu", "guru", "haiku", "bayou", "caribou", "thou",
    "dough", "bough", "plough", "thorough", "borough", "trough",
    "video", "radio", "piano", "studio", "audio", "photo", "auto",
    "echo", "motto", "logo", "memo", "demo", "tempo", "solo", "polo",
    "halo", "taco", "avocado", "mango", "volcano", "tornado",
    "mosquito", "buffalo", "cargo", "embargo", "scenario",
    "portfolio", "ratio", "patio", "stereo", "rodeo", "embryo",
}


# --------------------------------------------------------------------------
# sound helpers
# --------------------------------------------------------------------------
def _low(word: str) -> str:
    return word.lower().replace("’", "'")


def ends_consonant_sound(word: str) -> bool:
    w = _low(word).rstrip("'")
    if not w:
        return False
    if w in VOWEL_E_WORDS:
        return False
    if w.endswith(("que", "gue")):
        return True
    if w.endswith(("ee", "ie", "ue", "oe", "ye", "ae")):
        return False
    if w.endswith("gh"):
        return w in {"laugh", "cough", "enough", "tough", "rough", "trough"}
    last = w[-1]
    if last in CONSONANT_LETTERS:
        return True
    if last == "e" and len(w) > 1 and w[-2] in "bcdfgklmnprstvz":
        return True
    if last == "h":
        return w.endswith(("sh", "ch", "th", "ph"))
    return False


def starts_vowel_sound(word: str) -> bool:
    w = _low(word).rstrip("'")
    if not w:
        return False
    if w in H_VOWEL_WORDS:
        return True
    if w in CONSONANT_U_WORDS:
        return False
    return w[0] in "aeiou"


def glide_type(word: str) -> str:
    """j/w glide used when a vowel-final word meets a vowel."""
    w = _low(word).rstrip("'")
    if w == "the":
        return ""
    if w in GLIDE_J_WORDS:
        return "j"
    if w in GLIDE_W_WORDS:
        return "w"
    if w.endswith(("y", "ee", "ea", "ie", "ey", "ay", "oy", "uy",
                   "i", "eigh", "igh")):
        return "j"
    if w.endswith(("o", "u", "oo", "ew", "ow", "ou", "ue", "oe", "ough")):
        return "w"
    return ""


def final_td_sound(word: str) -> str:
    """Return t/d when the written word ends in a /t/ or /d/ sound."""
    w = _low(word).rstrip("'")
    if not w or w in {"would", "could", "should"}:
        return ""
    if w in SILENT_FINAL_T_WORDS or w in SILENT_E_TD_EXCEPTIONS:
        return ""
    if w.endswith("ed") and w not in TD_ED_WORDS:
        return ""
    if len(w) >= 2 and w[-2:] in {"te", "de"}:
        return w[-2]
    if w[-1] in "td":
        return w[-1]
    return ""


def _tokenize(sentence: str):
    matches = list(WORD_RE.finditer(sentence))
    if not matches:
        return None
    toks = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(sentence)
        word = m.group(0)
        toks.append({
            "w": word,
            "low": _low(word),
            "gap": sentence[m.end():end],
        })
    return {"lead": sentence[:matches[0].start()], "toks": toks}


def _space_gap(toks, i) -> bool:
    gap = toks[i]["gap"]
    return bool(gap) and gap.strip() == ""


def _elide_final_html(word: str, dropped: str) -> str:
    """nex(t) day / la(t)e / don('t) — visible with marks off."""
    if (len(word) >= 2 and word[-2] in "'’" and word[-1] in "td"
            and dropped == word[-1]):
        stem, text = word[:-2], word[-2:]
    elif word.endswith(dropped):
        stem, text = word[:-1], dropped
    elif len(word) >= 2 and word[-1] == "e" and word[-2] == dropped:
        stem, text = word[:-2], dropped
    else:
        return html.escape(word)
    return (
        html.escape(stem)
        + '<span class="el"><span class="paren">(</span>'
        + html.escape(text)
        + '<span class="paren">)</span></span>'
        + ("e" if word.endswith("e") else "")
    )


def _gap_html(gap: str, marker: bool) -> str:
    """Escape a gap, placing a sense-group bar after its punctuation."""
    if not marker:
        return html.escape(gap)
    idx = _sense_punct_index(gap)
    if idx < 0:
        return html.escape(gap)
    tail = gap[idx + 1:]
    quote = QUOTE_TAIL.match(tail)
    if quote and quote.group(3):
        cut = idx + 1 + len(quote.group(1)) + 1
        return (
            html.escape(gap[:cut])
            + '<span class="sg" aria-hidden="true">┃</span>'
            + html.escape(gap[cut:])
        )
    return (
        html.escape(gap[:idx + 1])
        + '<span class="sg" aria-hidden="true">┃</span>'
        + html.escape(gap[idx + 1:])
    )


SENSE_PUNCT = re.compile(r"[,;:—–]")
QUOTE_TAIL = re.compile(r'(\s*)(["“”\'‘’])(\s*)$')


def _sense_punct_index(text: str) -> int:
    """Last real punctuation mark; commas inside numbers (5,000) don't count."""
    idx = -1
    for match in SENSE_PUNCT.finditer(text):
        pos = match.start()
        if (0 < pos < len(text) - 1
                and text[pos - 1].isdigit() and text[pos + 1].isdigit()):
            continue
        idx = pos
    return idx


def _has_verb(tokens) -> bool:
    return any(t in FINITE_VERBS for t in tokens)


def _starts_clause(tokens) -> bool:
    if not tokens:
        return False
    first = tokens[0]
    if first in RELATIVE or first in SUBORD or first in DISCOURSE_WORDS:
        return True
    for phrase in DISCOURSE_PHRASES:
        if tuple(tokens[:len(phrase)]) == phrase:
            return True
    if first in SUBJECT_PRONOUNS or first in INDEFINITE_PRONOUNS:
        return _has_verb(tokens[1:])
    if first == "there":
        return _has_verb(tokens[1:])
    if first in {"this", "that", "these", "those"} and len(tokens) > 1:
        if tokens[1] in FINITE_VERBS and tokens[1] not in ADJECTIVES:
            return True
    if first in DETERMINERS:
        for idx in range(2, len(tokens)):
            if tokens[idx] in FINITE_VERBS and tokens[idx - 1] not in ADJECTIVES:
                return True
        return False
    if first in PREPOSITIONS or first in ADVERBS:
        return _has_verb(tokens)
    if first in UNAMBIGUOUS_FINITE:
        return True
    if first in FINITE_VERBS and first not in ADJECTIVES and first not in DETERMINERS:
        return True
    if first in FINITE_VERBS and len(tokens) > 1:
        if tokens[1] in SUBJECT_PRONOUNS or tokens[1] in {"that", "this"}:
            return True
    if first in {"even", "just", "only"} and len(tokens) > 1:
        if tokens[1] in {"if", "though", "when", "because"}:
            return True
    if first == "as" and len(tokens) > 1:
        if tokens[1] in {"soon", "long"} and len(tokens) > 2 and tokens[2] == "as":
            return True
        if tokens[1] in {"if", "though"}:
            return True
    if first in {"in", "so", "such", "now", "given", "provided",
                 "assuming", "considering", "except"} and len(tokens) > 1:
        if tokens[1] in {"case", "that"}:
            return True
    return False


def _comma_boundary(toks, lows, i: int, chunk_start: int) -> bool:
    prev_gap = toks[i - 1]["gap"]
    left = lows[chunk_start:i]
    if ('"' in prev_gap or "“" in prev_gap) and _has_verb(left):
        return True
    end = len(lows)
    for k in range(i, len(lows)):
        if k > i and _sense_punct_index(toks[k - 1]["gap"]) >= 0:
            end = k
            break
    right = lows[i:end]
    if right and right[0] in COORD:
        right = right[1:]
    return _starts_clause(right)


def _analyse(sentence: str):
    parsed = _tokenize(sentence)
    if not parsed:
        return None
    toks = parsed["toks"]
    n = len(toks)
    lows = [t["low"].rstrip("'") for t in toks]

    change_start: dict[int, int] = {}
    change_label: dict[int, str] = {}
    consumed = set()

    # --- fixed connected-speech chunks -----------------------------------
    i = 0
    while i < n:
        matched = False
        for words, label in PHRASES:
            size = len(words)
            if i + size > n:
                continue
            if tuple(lows[i:i + size]) != words:
                continue
            if not all(_space_gap(toks, k) for k in range(i, i + size - 1)):
                continue
            change_start[i] = i + size - 1
            change_label[i] = label
            consumed.update(range(i, i + size))
            i += size
            matched = True
            break
        if matched:
            continue

        if i + 2 < n and (lows[i], lows[i + 1]) in {("going", "to"), ("got", "to")}:
            if _space_gap(toks, i) and _space_gap(toks, i + 1) and lows[i + 2] in VERB_BASES:
                change_start[i] = i + 1
                change_label[i] = "gonna" if lows[i] == "going" else "gotta"
                consumed.update(range(i, i + 2))
                i += 2
                continue
        i += 1

    # --- weak forms and flap T -------------------------------------------
    for i, low in enumerate(lows):
        if i in consumed:
            continue
        label = WEAK_FORMS.get(low) or FLAP_WORDS.get(low)
        if label:
            change_start[i] = i
            change_label[i] = label
            consumed.add(i)

    # --- the + vowel: /ðə/ becomes /ði/ ----------------------------------
    for i in range(n - 1):
        if lows[i] == "the" and _space_gap(toks, i) and starts_vowel_sound(toks[i + 1]["low"]):
            change_start[i] = i
            change_label[i] = "thee"
            consumed.add(i)

    # --- final t/d before a consonant ------------------------------------
    elide_final: dict[int, str] = {}
    for i in range(n - 1):
        if not _space_gap(toks, i):
            continue
        if i in consumed or i + 1 in consumed:
            continue
        if i in change_start:
            continue
        if lows[i + 1] == "him":
            continue
        dropped = final_td_sound(toks[i]["w"])
        if dropped and not starts_vowel_sound(toks[i + 1]["low"]):
            elide_final[i] = dropped

    # --- h in him ---------------------------------------------------------
    elide_h: dict[int, None] = {}
    for i in range(n - 1):
        if not _space_gap(toks, i):
            continue
        if i in consumed or i + 1 in consumed:
            continue
        if lows[i + 1] == "him" and ends_consonant_sound(toks[i]["w"]):
            elide_h[i + 1] = None

    # --- linking: C+V, glides, and the + vowel ---------------------------
    link: dict[int, str] = {}
    for i in range(n - 1):
        if not _space_gap(toks, i):
            continue
        if i in consumed and i + 1 in consumed:
            continue
        if i in elide_final or i + 1 in elide_h:
            continue
        if not starts_vowel_sound(toks[i + 1]["low"]):
            continue
        if lows[i] == "the":
            link[i] = ""
            continue
        if ends_consonant_sound(toks[i]["w"]):
            link[i] = ""
            continue
        glide = glide_type(toks[i]["w"])
        if glide:
            link[i] = glide

    # --- sense groups -----------------------------------------------------
    sense_before: dict[int, None] = {}
    bar_after: dict[int, None] = {}
    gap_marker: dict[int, None] = {}
    chunk_start = 0
    for i in range(1, n):
        prev_gap = toks[i - 1]["gap"]
        pidx = _sense_punct_index(prev_gap)
        if pidx >= 0:
            ch = prev_gap[pidx]
            if ch == ",":
                if _comma_boundary(toks, lows, i, chunk_start):
                    gap_marker[i - 1] = None
                    chunk_start = i
            else:
                gap_marker[i - 1] = None
                chunk_start = i
            continue
        if not _space_gap(toks, i - 1):
            continue
        low = lows[i]
        prev = lows[i - 1]
        nxt = lows[i + 1] if i + 1 < n else ""

        if low in COORD and i - chunk_start >= 3 and nxt in COORD_GATE:
            sense_before[i] = None
            bar_after[i - 1] = None
            chunk_start = i
            continue
        if low in {"even", "just", "only", "simply"} and nxt in {"if", "though", "when", "because"}:
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low == "as" and nxt in {"soon", "long"} and i + 2 < n and lows[i + 2] == "as":
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low == "as" and nxt in {"if", "though"}:
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low == "ever" and nxt == "since":
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low in {"in", "so", "such", "now", "given", "provided",
                   "assuming", "considering", "except"} and nxt in {"case", "that"}:
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low in SUBORD:
            if prev in SUBORD_GUARDS.get(low, set()):
                continue
            if low == "while" and prev in DETERMINERS | {"worth"}:
                continue
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low in RELATIVE:
            if i - chunk_start >= 2:
                sense_before[i] = None
                bar_after[i - 1] = None
                chunk_start = i
            continue
        if low == "that":
            if prev in THAT_GUARDS:
                continue
            end = len(lows)
            for k in range(i + 1, len(lows)):
                if _sense_punct_index(toks[k - 1]["gap"]) >= 0:
                    end = k
                    break
            right = lows[i + 1:end]
            if (right and (right[0] in SUBJECT_PRONOUNS
                           or right[0] in INDEFINITE_PRONOUNS
                           or right[0] in FINITE_VERBS
                           or _starts_clause(right))):
                if i - chunk_start >= 2:
                    sense_before[i] = None
                    bar_after[i - 1] = None
                    chunk_start = i

    # A pause means no linking or elision across it.
    for i in list(link):
        if i + 1 in sense_before:
            del link[i]
    for i in list(elide_final):
        if i + 1 in sense_before:
            del elide_final[i]
    for i in list(elide_h):
        if i in sense_before:
            del elide_h[i]
    for start in list(change_start):
        end = change_start[start]
        if any(k in sense_before for k in range(start + 1, end + 1)):
            del change_start[start]
            del change_label[start]

    return parsed, {
        "change_start": change_start,
        "change_label": change_label,
        "elide_final": elide_final,
        "elide_h": elide_h,
        "link": link,
        "sense_before": sense_before,
        "bar_after": bar_after,
        "gap_marker": gap_marker,
    }


def annotate(sentence: str, thought_groups: bool = True) -> str:
    """Return the sentence as HTML with pronunciation marks.

    ``thought_groups=False`` leaves out the sense-group bars, for readers that
    play one whole sentence per tap and do not split it visually.
    """
    analysed = _analyse(sentence)
    if not analysed:
        return html.escape(sentence)
    parsed, marks = analysed
    toks = parsed["toks"]
    change_start = marks["change_start"]
    change_label = marks["change_label"]
    elide_final = marks["elide_final"]
    elide_h = marks["elide_h"]
    link = marks["link"]
    bar_after = marks["bar_after"]
    gap_marker = marks["gap_marker"]

    out = [html.escape(parsed["lead"])]
    open_change = None

    for i, tok in enumerate(toks):
        word = tok["w"]
        gap = tok["gap"]

        if i in change_start:
            out.append('<span class="chg">')
            open_change = change_start[i]

        if i in elide_final:
            word_html = _elide_final_html(word, elide_final[i])
        elif i in elide_h:
            word_html = (
                '<span class="el"><span class="paren">(</span>h'
                '<span class="paren">)</span></span>'
                + html.escape(word[1:])
            )
        else:
            word_html = html.escape(word)

        out.append(word_html)

        if open_change == i:
            label = change_label.get(_change_start_for(i, change_start), "")
            if label:
                out.append(f'<sup class="say" aria-hidden="true">{html.escape(label)}</sup>')
            out.append("</span>")
            open_change = None

        if i in link:
            out.append('<span class="lnk" aria-hidden="true">‿</span>')
            if link[i] in {"j", "w"}:
                out.append(f'<sup class="glide" aria-hidden="true">{link[i]}</sup>')

        if thought_groups and i in bar_after:
            out.append('<span class="sg" aria-hidden="true">┃</span>')

        out.append(_gap_html(gap, thought_groups and i in gap_marker))

    return "".join(out)


def _change_start_for(i: int, change_start: dict[int, int]) -> int:
    for start, end in change_start.items():
        if end == i:
            return start
    return i
