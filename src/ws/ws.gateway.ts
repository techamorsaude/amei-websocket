import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { ConnectedSocket } from '@nestjs/websockets/decorators';
import { Server, Socket } from 'socket.io';
import { ConsultaDto, ProfissionalDto } from './dto/ws.dto';


enum Events {
  iniciar_consulta_event = 'iniciar_consulta',
  finalizar_consulta_event = 'finalizar_consulta',
  consultas_ativas_event = 'consultas',
}
enum ClientType {
  MEDICO = 0,
  PACIENTE = 1,
}
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/ws',
  pingTimeout: 60000
  //transports: ['websocket'],
})
export class WsGateway implements OnGatewayDisconnect<Socket> {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('consultaMedicoJoin')
  async consultaMedicoJoin(
    @MessageBody() data: ProfissionalDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    (client as any).tipo = ClientType.MEDICO;
    (client as any).profissional = data.profissional;
    client.join(`room-p-${data.profissional}`);
    await this.internalSendConnections(data.profissional);
  }

  @SubscribeMessage('consultaIniciar')
  async consultaIniciar(
    @MessageBody() data: ConsultaDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    this.server
      .to(`room-consulta-${data.consulta}`)
      .emit(Events.iniciar_consulta_event, { consulta: data.consulta });

      console.log('Medico: '+(client as any).profissional,Events.iniciar_consulta_event, { consulta: data.consulta })

    client.join(`room-consulta-${data.consulta}`);
  }
  @SubscribeMessage('consultaFinalizar')
  async consultaFinalizar(
    @MessageBody() data: ConsultaDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    // Médico fechando a consulta
    client.leave(`room-consulta-${data.consulta}`);

    this.server
      .to(`room-consulta-${data.consulta}`)
      .emit(Events.finalizar_consulta_event, { consulta: data.consulta });

      console.log('Medico: '+(client as any).profissional,Events.finalizar_consulta_event, { consulta: data.consulta })
  }

  async internalSendConnections(profissional: number) {
    if (!profissional) return;

    const sockets = await this.server
      .in(`room-p-${profissional}`)
      .fetchSockets();

    const consultas = new Set<number>();
    const medicos = new Set<string>();

    sockets.forEach((s) => {
      if ((s as any).tipo == ClientType.MEDICO) {
        medicos.add(s.id);
      } else {
        if ((s as any).consulta && !consultas.has((s as any).consulta))
          consultas.add((s as any).consulta);
      }
    });
    const _c= Array.from(consultas);
    console.log('Medico: '+profissional,Events.consultas_ativas_event, _c)
    this.server.to(Array.from(medicos)).emit(Events.consultas_ativas_event, {
      consultas: _c,
    });
  }

  @SubscribeMessage('consultaPacienteJoin')
  async handleEvent(
    @MessageBody() data: ConsultaDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    (client as any).tipo = ClientType.PACIENTE;
    (client as any).consulta = data.consulta;
    (client as any).profissional = data.profissional;

    client.join(`room-p-${data.profissional}`);
    client.join(`room-consulta-${data.consulta}`);

    await this.internalSendConnections(data.profissional);

    const sockets = await this.server
      .in(`room-consulta-${data.consulta}`)
      .fetchSockets();

    if (sockets.find((s: any) => s.tipo == ClientType.MEDICO)) {
      client.emit(Events.iniciar_consulta_event, { consulta: data.consulta });
    }

    return data;
  }

  handleDisconnect(client: Socket) {
    if ((client as any).tipo == ClientType.MEDICO) {
      console.log('Disconnected medico: ', (client as any).profissional);
    } else {
      console.log('Disconnected consulta: ', (client as any).consulta);
      client.leave(`room-p-${(client as any).profissional}`);
      client.leave(`room-consulta-${(client as any).consulta}`);
  
    }

    this.internalSendConnections((client as any).profissional);
  }
}
