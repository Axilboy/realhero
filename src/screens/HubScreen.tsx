export default function HubScreen() {
  return (
    <div className="screen screen--hub">
      <p className="screen__badge">Игровой хаб</p>
      <h1 className="screen__title">Герой</h1>
      <p className="screen__text">
        Здесь будет аватар, уровень, опыт, стрики и краткая сводка дня.
      </p>
      <div className="screen__placeholder">LVL · EXP · Квесты дня</div>
    </div>
  );
}
