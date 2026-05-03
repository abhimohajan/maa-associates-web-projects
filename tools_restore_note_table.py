# -*- coding: utf-8 -*-
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
p = ROOT / "note_sheet.html"
text = p.read_text(encoding="utf-8")
start = text.find(
    '<table class="doc-table"><tbody><tr><td><div class="doc-p" style="text-align:center">'
    '<span class="b" style="font-family:\'SutonnyMJ\',SutonnyMJ,SolaimanLipi,serif;font-size:9.0pt">µ. bs.</span>'
)
if start == -1:
    raise SystemExit("start marker not found")
end = text.find(
    '<p class="doc-p" style="text-align:both"><span class="green-serial" style="color:#00B050;'
    "font-family:'SutonnyMJ',SutonnyMJ,SolaimanLipi,serif;font-size:13.5pt\" data-green-template=\"05\">05</span>",
    start,
)
if end == -1:
    raise SystemExit("end marker not found")

new_tbl = r"""<table class="doc-table">
<tbody>
<tr>
<td rowspan="2"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">ক্র. নং.</span></div></td>
<td colspan="2"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">পণ্যের বিবরণ</span></div></td>
<td colspan="2"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">পণ্যের এইচ এস কোড</span></div></td>
<td colspan="3"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">পণ্যের ওজন / সংখ্যা</span></div></td>
<td colspan="2"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">মূল্য (প্রতি একক) (ডলার)</span></div></td>
<td rowspan="1"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:8.0pt">এই চালানের মূল্য (ডলার)</span></div></td>
<td rowspan="1"><div class="doc-p" style="text-align:center"><span class="b" style="font-size:8.0pt">মোট শুল্কায়িত মূল্য (ডলার)</span></div></td>
</tr>
<tr>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">ঘোষিত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">প্রাপ্ত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">ঘোষিত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">প্রাপ্ত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">ঘোষিত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">প্রাপ্ত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">পার্থক্য</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">ঘোষিত</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:8.5pt">ভ্যালুয়েশন মেথড অনুযায়ী</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">--</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">--</span></div></td>
</tr>
<tr>
<td><div class="doc-p" style="text-align:center"><span class="b" style="font-size:9.0pt">01</span></div></td>
<td colspan="2"><div class="doc-p" style="text-align:both"><span class="red-link b" data-red-index="34" data-template="Flate Rolled Products Of Iron Or Non-Alloy Steel Of A Width OF 600 mm Or More,  Hot- rolled,  Not Cald Plated or Coated.">Flate Rolled Products Of Iron Or Non-Alloy Steel Of A Width OF 600 mm Or More, Hot- rolled, Not Cald Plated or Coated.</span></div><div class="doc-p" style="text-align:both"><span class="red-link b" data-red-index="35" data-template="Secondary Quality">Secondary Quality</span></div><div class="doc-p" style="text-align:both"><span class="red-link b" data-red-index="36" data-template="Thickness: Less Than 3.00 mm">Thickness: Less Than 3.00 mm</span></div><div class="doc-p" style="text-align:both"><span class="red-link b" data-red-index="37" data-template="Size: 600 mm up x 1000 mm up">Size: 600 mm up x 1000 mm up</span></div><div class="doc-p" style="text-align:both"><span class="red-link b" data-red-index="38" data-template="C/O: ">C/O:</span> <span class="red-link b" data-red-index="39" data-template="KOREA ">KOREA</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b">--</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="40" data-template="7208.54.00">7208.54.00</span></div><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="41" data-template="TTI=39.75%">TTI=39.75%</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b">--</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="42" data-template="48,386 kgs">48,386 kgs</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="b">--</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="43" data-template="0.55/kg">0.55/kg</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="44" data-template="0.57/kg">0.57/kg</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="45" data-template="26,612.30">26,612.30</span></div></td>
<td><div class="doc-p" style="text-align:center"><span class="red-link b" data-red-index="46" data-template="27,580.02">27,580.02</span></div></td>
</tr>
<tr>
<td colspan="6" style="border-bottom:1px solid #222">
<div class="doc-p"><span class="b">Total Gross Weight : </span><span class="red-link b" data-red-index="63" data-template="63,346.00 ">63,346.00 </span><span class="b">kgs</span></div>
<div class="doc-p"><span class="b">Total Net Weight : </span><span class="red-link b" data-red-index="64" data-template="60,386.00 ">60,386.00 </span><span class="b">kgs</span></div>
</td>
<td colspan="6" style="border-bottom:1px solid #222">
<div class="doc-p" style="text-align:right"><span class="b">Total Value for Ass. </span><span class="red-link b" data-red-index="65" data-template="36,220.02">36,220.02</span></div>
<div class="doc-p" style="text-align:right"><span class="b">BD Tk. </span><span class="red-link b" data-red-index="66" data-template="44,44,920.00">44,44,920.00</span></div>
<div class="doc-p" style="text-align:right"><span class="b">Value for Ass Tk. </span><span class="red-link b" data-red-index="67" data-template="45,34,264.00">45,34,264.00</span></div>
</td>
</tr>
</tbody>
</table>
"""

p.write_text(text[:start] + new_tbl + text[end:], encoding="utf-8")
print("ok", end - start, "->", len(new_tbl))
