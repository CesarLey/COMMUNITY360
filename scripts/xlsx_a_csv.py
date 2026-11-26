"""
Convierte los .xlsx entregados a CSV (el enunciado habla de CSV).

PROBLEMA DETECTADO: al guardarse en Excel (configuracion regional EE. UU.), las
fechas dd/mm/aaaa ambiguas (dia <= 12) se convirtieron en celdas de fecha con
DIA y MES INVERTIDOS; las no ambiguas (dia > 12) quedaron como texto.
Evidencia: en las 636 cadenas el dia siempre es > 12, y en las 432 celdas de fecha
el "dia" siempre es <= 12. Con la inversion corregida, ultima_actividad >= fecha_ingreso
en el 100% de los usuarios y no hay fechas futuras (sin corregir: 94.2% y 26 fechas futuras).

Aqui se restaura el texto original dd/mm/aaaa para que el CSV sea uniforme.
"""
import sys, datetime as dt
import pandas as pd

def restaurar(v):
    if isinstance(v, (dt.datetime, pd.Timestamp)):
        return f"{v.month:02d}/{v.day:02d}/{v.year}"   # dd = mes de la celda, mm = dia de la celda
    return v

def main(usuarios_xlsx, inter_xlsx, out_dir):
    u = pd.read_excel(usuarios_xlsx, dtype=object)
    for c in ("fecha_ingreso", "ultima_actividad"):
        u[c] = u[c].map(restaurar)
    u.to_csv(f"{out_dir}/comunidad_virtual_usuarios.csv", index=False, encoding="utf-8")
    i = pd.read_excel(inter_xlsx, dtype=object)   # timestamps ya vienen como texto ISO
    i.to_csv(f"{out_dir}/comunidad_virtual_interacciones_1000.csv", index=False, encoding="utf-8")
    print("usuarios:", len(u), "interacciones:", len(i))

if __name__ == "__main__":
    main(*sys.argv[1:4])
