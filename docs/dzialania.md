# DZIALANIA - WORKFLOW IMPLEMENTACJI

## OPIS WORKFLOW

Pracujemy w systemie fazowym. Każda faza to osobna sesja w Claude Code. Piszesz w języku polskim!
Piszesz prompt do pierwszej fazy wg opisu: TODO.md i plan-fazy-23-36.md - nie zapisujesz go tylko wyswietlasz w konsoli. Do kazdej z faz to samo!
Ja ten prompt kopiuję do nowej sesji. Uruchamiam pisanie kodu. TY piszesz kod wg bardzo dokładnych wytycznych, analizujesz bezpieczeństwo kodu, nie zostawiasz nie zamkniętych furtek - czyli zawsze dokańczasz kod. Po napisaniu kodu robisz testy wewnętrzne, podsumowanie z opisem dokładnym co zmieniłeś, opis co i jak można przetestować wizualnie. Zapisujesz/odhaczasz to co w danej fazie zrobiłeś i pytasz czy możesz napisać prompt do kolejnej fazy. Prompt piszesz w konsoli - nie zapisujesz na dysku!
Dokładnie analizujesz pliki:

### Przed każdą fazą:
1. User kopiuje prompt do nowej sesji
2. Prompt zawiera:
   - Numer fazy
   - Linki do plików TODO.md i plan-fazy-23-36.md oraz dzialania.md
   - Opis co ma być wykonane w tej fazie

### W trakcie fazy:
1. Claude czyta TODO.md i plan-fazy-23-36.md
2. Claude implementuje zadania z danej fazy
3. Claude NIE koduje nic z kolejnych faz
4. Claude pisze kod bezpiecznie i kompletnie
5. Piszem kompletne tlumaczenia w kazdym jezyku z programu SAFE
6. piszemy zawsze w jezyku Polskim

### Po zakończeniu fazy:
1. **Podsumowanie** - co zostało zrobione (lista zmian)
2. **Testy wewnętrzne** - Claude weryfikuje że:
   - TypeScript kompiluje się bez błędów
   - Kod jest spójny z istniejącym
   - Nie ma błędów składniowych
3. **Instrukcja testów dla usera** - jeśli coś można przetestować wizualnie:
   - Co user powinien zobaczyć
   - Jak uruchomić test
   - Oczekiwany wynik
4. **Aktualizacja TODO.md** - oznaczenie ukończonych zadań

### Po fazie:
1. User testuje wizualnie (jeśli dotyczy)
2. User decyduje czy:
   - Przejść do kolejnej fazy
   - Poprawić coś w bieżącej fazie
   - Zmienić plan

## DOBRE PRAKTYKI

### 1. Wersjonowanie (Git)
Po każdej fazie należy robić commit z opisem co zostało zrobione. Przykład:
```
git add .
git commit -m "Faza X: [opis zmian]"
```
Dzięki temu mamy historię zmian i możliwość rollbacku.

### 2. Testy automatyczne
Oprócz testów wewnętrznych (kompilacja TypeScript) warto rozważyć:
- **Unit testy** - testowanie pojedynczych funkcji/komponentów
- **E2E testy** - testowanie całych scenariuszy użytkownika
- **Testy integracyjne** - sprawdzanie współpracy między modułami

Przed każdą fazą warto uruchomić istniejące testy, aby upewnić się że nowe zmiany nie wprowadzą regresji.

